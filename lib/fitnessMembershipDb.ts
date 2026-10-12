import { neon } from "@neondatabase/serverless";
import { canonicalMemberEmail } from "@/lib/memberIdentity";
import {
  FITNESS_ACCESS_GROUP_ID,
  grantFitnessAccess,
  revokeFitnessAccess,
  pickaxeUserHasFitnessAccess,
} from "@/lib/pickaxeAccess";
import { getVerifiedSubscription } from "@/lib/stripeMembershipState";
import { stripeSubscriptionIsActive } from "@/lib/stripeServer";

function connectionString() {
  const value =
    process.env.STORAGE_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL;
  if (!value) throw new Error("Membership database is not configured.");
  return value;
}

export function membershipDb() {
  return neon(connectionString());
}

export async function ensureFitnessMembershipSchema() {
  const sql = membershipDb();

  await sql`
    CREATE TABLE IF NOT EXISTS fitness_memberships (
      email TEXT PRIMARY KEY,
      clerk_user_id TEXT,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      stripe_status TEXT,
      access_active BOOLEAN NOT NULL DEFAULT FALSE,
      access_group_id TEXT,
      last_event_type TEXT,
      last_event_id TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    ALTER TABLE fitness_memberships
    ADD COLUMN IF NOT EXISTS last_stripe_verified_at TIMESTAMPTZ
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS fitness_memberships_active_idx
    ON fitness_memberships (access_active)
  `;

  // An individual Stripe subscription must never be attached to multiple
  // members, even when an older Pickaxe account is being reconciled.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS fitness_memberships_subscription_idx
    ON fitness_memberships (stripe_subscription_id)
    WHERE stripe_subscription_id IS NOT NULL
  `;

  return sql;
}

export async function getFitnessMembership(email: string) {
  const memberEmail = canonicalMemberEmail(email);
  const sql = await ensureFitnessMembershipSchema();
  const rows = await sql`
    SELECT *
    FROM fitness_memberships
    WHERE email = ${memberEmail}
    LIMIT 1
  `;
  return rows[0] || null;
}

export async function getFitnessMembershipBySubscriptionId(subscriptionId: string) {
  if (!/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) return null;
  const sql = await ensureFitnessMembershipSchema();
  const rows = await sql`
    SELECT *
    FROM fitness_memberships
    WHERE stripe_subscription_id = ${subscriptionId}
    LIMIT 2
  `;
  if (rows.length > 1) throw new Error("Duplicate Stripe subscription binding.");
  return rows[0] || null;
}

// This deliberately cannot create paid access or touch a different subscription.
// The existing member must already have authenticated and received legacy access.
export async function linkLegacyFitnessMembershipBilling(args: {
  email: string;
  clerkUserId: string;
  customerId: string;
  subscriptionId: string;
  stripeStatus: string;
}) {
  const memberEmail = canonicalMemberEmail(args.email);
  if (
    !args.clerkUserId ||
    !/^cus_[A-Za-z0-9]+$/.test(args.customerId) ||
    !/^sub_[A-Za-z0-9]+$/.test(args.subscriptionId) ||
    !["active", "trialing"].includes(args.stripeStatus)
  ) return null;

  const sql = await ensureFitnessMembershipSchema();
  const rows = await sql`
    UPDATE fitness_memberships
    SET stripe_customer_id = ${args.customerId},
        stripe_subscription_id = ${args.subscriptionId},
        stripe_status = ${args.stripeStatus},
        last_event_type = 'legacy_billing_link_verified',
        last_event_id = NULL,
        updated_at = NOW()
    WHERE email = ${memberEmail}
      AND clerk_user_id = ${args.clerkUserId}
      AND access_active = TRUE
      AND stripe_status = 'legacy_pickaxe_member'
      AND stripe_customer_id IS NULL
      AND stripe_subscription_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM fitness_memberships
        WHERE stripe_subscription_id = ${args.subscriptionId}
          AND email <> ${memberEmail}
      )
    RETURNING *
  `;
  return rows[0] || null;
}

export async function saveFitnessMembership(args: {
  email: string;
  clerkUserId?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
  stripeStatus?: string | null;
  active: boolean;
  eventType?: string | null;
  eventId?: string | null;
}) {
  const memberEmail = canonicalMemberEmail(args.email);
  const sql = await ensureFitnessMembershipSchema();
  const rows = await sql`
    INSERT INTO fitness_memberships (
      email,
      clerk_user_id,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_status,
      access_active,
      access_group_id,
      last_event_type,
      last_event_id,
      updated_at
    ) VALUES (
      ${memberEmail},
      ${args.clerkUserId || null},
      ${args.customerId || null},
      ${args.subscriptionId || null},
      ${args.stripeStatus || null},
      ${args.active},
      ${args.active ? FITNESS_ACCESS_GROUP_ID : null},
      ${args.eventType || null},
      ${args.eventId || null},
      NOW()
    )
    ON CONFLICT (email) DO UPDATE SET
      clerk_user_id = COALESCE(EXCLUDED.clerk_user_id, fitness_memberships.clerk_user_id),
      stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, fitness_memberships.stripe_customer_id),
      stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, fitness_memberships.stripe_subscription_id),
      stripe_status = EXCLUDED.stripe_status,
      last_stripe_verified_at = CASE
        WHEN EXCLUDED.stripe_subscription_id IS NOT NULL
          THEN NOW()
        ELSE fitness_memberships.last_stripe_verified_at
      END,
      access_active = EXCLUDED.access_active,
      access_group_id = EXCLUDED.access_group_id,
      last_event_type = EXCLUDED.last_event_type,
      last_event_id = EXCLUDED.last_event_id,
      updated_at = NOW()
    RETURNING *
  `;
  return rows[0] || null;
}

// Stripe is authoritative for subscriptions already bound to a member.
// Refresh at most once every 15 minutes to avoid checking Stripe on each chat
// message, but also allow a recovered failed payment to regain access.
export async function refreshLinkedMembershipStatus(
  email: string,
  options: { force?: boolean } = {},
) {
  const memberEmail = canonicalMemberEmail(email);
  const existing = await getFitnessMembership(memberEmail);
  if (!existing?.stripe_customer_id || !existing.stripe_subscription_id) return existing;

  const lastChecked = existing.last_stripe_verified_at
    ? new Date(String(existing.last_stripe_verified_at)).getTime() : 0;
  if (!options.force && lastChecked > Date.now() - 15 * 60 * 1000) {
    return existing;
  }

  const live = await getVerifiedSubscription({
    customerId: String(existing.stripe_customer_id),
    subscriptionId: String(existing.stripe_subscription_id),
    memberEmail,
  });
  if (!live) throw new Error("Unable to verify linked Stripe subscription.");

  const active = stripeSubscriptionIsActive(live.status);
  const sql = await ensureFitnessMembershipSchema();
  const rows = await sql`
    UPDATE fitness_memberships
    SET stripe_status = ${live.status},
        access_active = ${active},
        access_group_id = ${active ? FITNESS_ACCESS_GROUP_ID : null},
        last_stripe_verified_at = NOW(),
        updated_at = CASE
          WHEN stripe_status IS DISTINCT FROM ${live.status}
               OR access_active IS DISTINCT FROM ${active}
          THEN NOW() ELSE updated_at END
    WHERE email = ${memberEmail}
      AND stripe_subscription_id = ${live.subscriptionId}
      AND stripe_customer_id = ${live.customerId}
    RETURNING *
  `;
  const updated = rows[0] || (await getFitnessMembership(memberEmail));

  if (rows.length && existing.access_active !== active) {
    try {
      if (active) await grantFitnessAccess(memberEmail);
      else await revokeFitnessAccess(memberEmail);
    } catch (error) {
      console.error("[membership] Pickaxe status sync pending", {
        message: error instanceof Error ? error.message : String(error),
      });
      // Site access is still governed by the verified Stripe status in Neon.
    }
  }
  return updated;
}

export async function memberHasFitnessAccess(
  email: string,
  clerkUserId?: string,
  options: { fallbackToPickaxeList?: boolean } = {},
) {
  const memberEmail = canonicalMemberEmail(email);
  const existing = await refreshLinkedMembershipStatus(memberEmail);

  if (existing?.access_active === true) {
    if (
      clerkUserId &&
      String(existing.clerk_user_id || "") !== clerkUserId
    ) {
      const sql = await ensureFitnessMembershipSchema();
      await sql`
        UPDATE fitness_memberships
        SET clerk_user_id = ${clerkUserId},
            updated_at = NOW()
        WHERE email = ${memberEmail}
      `;
    }
    return true;
  }

  // Once a customer is linked to paid billing, a canceled or lapsed
  // subscription must never fall back to a stale Pickaxe access group.
  // Their Clerk identity and saved coach history remain untouched.
  if (existing?.stripe_customer_id || existing?.stripe_subscription_id) {
    return false;
  }

  const legacyActive = await pickaxeUserHasFitnessAccess(memberEmail, {
    fallbackToList: options.fallbackToPickaxeList ?? true,
  });

  if (!legacyActive) {
    return false;
  }

  await saveFitnessMembership({
    email: memberEmail,
    clerkUserId: clerkUserId || null,
    stripeStatus: "legacy_pickaxe_member",
    active: true,
    eventType: "legacy_sync",
  });

  return true;
}

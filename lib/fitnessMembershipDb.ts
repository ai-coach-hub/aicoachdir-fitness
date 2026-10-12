import { neon } from "@neondatabase/serverless";
import { canonicalMemberEmail } from "@/lib/memberIdentity";
import {
  FITNESS_ACCESS_GROUP_ID,
  pickaxeUserHasFitnessAccess,
} from "@/lib/pickaxeAccess";

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
      access_active = EXCLUDED.access_active,
      access_group_id = EXCLUDED.access_group_id,
      last_event_type = EXCLUDED.last_event_type,
      last_event_id = EXCLUDED.last_event_id,
      updated_at = NOW()
    RETURNING *
  `;
  return rows[0] || null;
}

export async function memberHasFitnessAccess(
  email: string,
  clerkUserId?: string,
  options: { fallbackToPickaxeList?: boolean } = {},
) {
  const memberEmail = canonicalMemberEmail(email);
  const existing = await getFitnessMembership(memberEmail);

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

  const hasRealStripeRecord =
    !!existing &&
    !!(existing.stripe_customer_id || existing.stripe_subscription_id);

  const stripeInactive =
    !!existing &&
    (
      existing.stripe_status === "canceled" ||
      existing.stripe_status === "past_due" ||
      existing.stripe_status === "unpaid" ||
      existing.stripe_status === "incomplete_expired" ||
      existing.last_event_type === "customer.subscription.deleted"
    );

  if (hasRealStripeRecord && stripeInactive) {
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

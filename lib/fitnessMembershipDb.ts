import { neon } from "@neondatabase/serverless";
import { canonicalMemberEmail } from "@/lib/memberIdentity";
import {
  FITNESS_ACCESS_GROUP_ID,
  pickaxeUserHasFitnessAccess,
} from "@/lib/pickaxeAccess";

const PREVIEW_SANDBOX_BRANCH = "feature/life-coach-agent-sandbox-20261011";
const PREVIEW_NEON_BRANCH_ID = "br-autumn-breeze-auw38rgr";

function onFitnessPreviewSandbox() {
  return process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_GIT_COMMIT_REF === PREVIEW_SANDBOX_BRANCH;
}

function connectionString() {
  // A sandbox preview must never fall back to the inherited production URLs.
  if (onFitnessPreviewSandbox()) {
    const isolated = process.env.LIFE_COACH_DATABASE_URL;
    if (!isolated) throw new Error("Sandbox membership database is not configured.");
    return isolated;
  }
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

async function verifiedMembershipDb() {
  const sql = membershipDb();
  if (onFitnessPreviewSandbox()) {
    // Check the database identity BEFORE any reads, schema DDL or writes.
    const rows = await sql`SELECT current_setting('neon.branch_id', true) AS branch_id`;
    if (String(rows[0]?.branch_id || "") !== PREVIEW_NEON_BRANCH_ID) {
      throw new Error("Sandbox membership database branch mismatch.");
    }
  }
  return sql;
}

export async function ensureFitnessMembershipSchema() {
  const sql = await verifiedMembershipDb();

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

  // Never synchronize external Pickaxe membership into the private sandbox.
  // Test access must already be explicitly present in the isolated DB.
  if (onFitnessPreviewSandbox()) return false;

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

import { neon } from "@neondatabase/serverless";
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

  return sql;
}

export async function getFitnessMembership(email: string) {
  const sql = await ensureFitnessMembershipSchema();
  const rows = await sql`
    SELECT *
    FROM fitness_memberships
    WHERE email = ${email}
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
      ${args.email},
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
) {
  const existing = await getFitnessMembership(email);
  if (existing) return existing.access_active === true;

  // Preserve existing paid Pickaxe members during the migration only when
  // this email has never been tracked by the new billing system.
  const legacyActive = await pickaxeUserHasFitnessAccess(email);
  if (!legacyActive) return false;

  await saveFitnessMembership({
    email,
    clerkUserId: clerkUserId || null,
    stripeStatus: "legacy_pickaxe_member",
    active: true,
    eventType: "legacy_sync",
  });
  return true;
}

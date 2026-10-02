// Read-only compatibility for members whose plans predate the website hub.
// The caller must authenticate and verify membership before calling this helper.
// @ts-expect-error The legacy decoder is an existing JavaScript module.
import { unwrapStoredValue } from '../app/api/pickaxe/workout-plan/bridge-core.mjs';

type JsonRecord = Record<string, unknown>;
type ReadResult = { plan: JsonRecord | null; source: 'member-memory' | 'server-cache' | null };
type Options = {
  fetchImpl?: typeof fetch;
  cacheReader?: (email: string) => Promise<unknown>;
};

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}
function deleted(value: JsonRecord) {
  return value.deleted === true || value.isDeleted === true || !!value.deletedAt ||
    /^(?:deleted|draft|preview)$/i.test(String(value.status || ''));
}
function hasForeignMember(value: unknown, email: string, depth = 0): boolean {
  if (depth > 12) return true;
  const item = record(value);
  if (!item) return false;
  for (const key of ['_historyBridge', 'historyBridge']) {
    const bridge = record(item[key]);
    if (typeof bridge?.email === 'string' && bridge.email.trim().toLowerCase() !== email) return true;
  }
  const next = record(item.nextPlan);
  return !!next && hasForeignMember(next.plan || next, email, depth + 1);
}
function isPlan(value: JsonRecord) {
  const workouts = record(value.workouts);
  const rows = Array.isArray(value.weekSchedule) && value.weekSchedule.length
    ? value.weekSchedule : value.flexibleSequence;
  return typeof value.planId === 'string' && !!value.planId.trim() &&
    !!workouts && Object.keys(workouts).length > 0 && Array.isArray(rows) && rows.length > 0;
}

export function legacyPlanFromPayload(payload: unknown, memberEmail: string): JsonRecord | null {
  const email = memberEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const candidates: JsonRecord[] = [];
  const seen = new WeakSet<object>();
  function visit(value: unknown, depth = 0) {
    if (depth > 12 || value == null) return;
    if (Array.isArray(value)) { value.forEach((item) => visit(item, depth + 1)); return; }
    const raw = record(value);
    if (raw && (deleted(raw) || hasForeignMember(raw, email))) return;
    if (raw) {
      if (seen.has(raw)) return;
      seen.add(raw);
    }
    // Same non-executable decoder used by the existing Pickaxe workout portal.
    const decoded: unknown = unwrapStoredValue(value);
    if (decoded !== value) { visit(decoded, depth + 1); return; }
    const item = record(decoded);
    if (!item || deleted(item) || hasForeignMember(item, email)) return;
    if (isPlan(item)) {
      candidates.push(item);
      // A staged nextPlan must remain attached to its root, not win by timestamp.
      return;
    }
    // Do not search chat text, notes, exercise descriptions or arbitrary fields.
    for (const key of ['data', 'items', 'memories', 'results', 'plan', 'currentPlan', 'workoutPlan']) {
      if (key in item) visit(item[key], depth + 1);
    }
  }
  visit(payload);
  candidates.sort((a, b) =>
    (Date.parse(String(b.updatedAt || '')) || 0) - (Date.parse(String(a.updatedAt || '')) || 0));
  return candidates[0] || null;
}

async function existingCache(email: string): Promise<unknown> {
  const connection = process.env.STORAGE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connection) return null;
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(connection);
  // SELECT only: never create a table, rewrite a memory or rebuild a member's plan.
  const rows = await sql`SELECT plan_json FROM workout_plan_cache WHERE email = ${email} LIMIT 1`;
  return rows[0]?.plan_json ?? null;
}

export async function readLegacyMemberPlan(
  memberEmail: string,
  studioToken: string,
  options: Options = {},
): Promise<ReadResult> {
  const email = String(memberEmail || '').trim().toLowerCase();
  const empty: ReadResult = { plan: null, source: null };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !studioToken) return empty;
  const fetchImpl = options.fetchImpl || fetch;
  try {
    const response = await fetchImpl(
      `https://api.pickaxe.co/v1/studio/memory/user/${encodeURIComponent(email)}?skip=0&take=100`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${studioToken}`, Accept: 'application/json' },
        cache: 'no-store', signal: AbortSignal.timeout(6_000),
      },
    );
    if (response.ok) {
      const plan = legacyPlanFromPayload(await response.json(), email);
      if (plan) return { plan, source: 'member-memory' };
    }
  } catch { /* The same-member stored cache is a fallback, not evidence of no plan. */ }
  try {
    const cached = await (options.cacheReader || existingCache)(email);
    const plan = legacyPlanFromPayload(cached, email);
    if (plan) return { plan, source: 'server-cache' };
  } catch { /* Missing/unavailable cache must not overwrite or invent a plan. */ }
  return empty;
}

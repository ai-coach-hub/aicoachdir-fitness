import { readWorkoutPlanCache, writeWorkoutPlanCache } from '../../../../lib/workout-plan-cache-db.mjs';
import { buildCorsHeaders, handleWorkoutPlanRead } from './route-core.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_ALLOWED_ORIGINS = ['https://studio.pickaxe.co'];

function getWorkspaceToken() {
  return (
    process.env.PICKAXE_WORKSPACE_API_TOKEN ||
    process.env.PICKAXE_WORKSPACE_API_KEY ||
    process.env.WORKSPACE_API_TOKEN ||
    process.env.PICKAXE_API_KEY ||
    ''
  ).trim();
}

function allowedOrigins() {
  const configured = (
    process.env.PICKAXE_WORKOUT_PLAN_ALLOWED_ORIGINS ||
    process.env.PICKAXE_HISTORY_ALLOWED_ORIGINS ||
    ''
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

export async function OPTIONS(request) {
  const origin = request.headers.get('origin')?.trim() || '';
  const origins = allowedOrigins();
  if (origin && !origins.has(origin)) {
    return new Response(null, {
      status: 403,
      headers: { 'Cache-Control': 'no-store', Vary: 'Origin' },
    });
  }
  return new Response(null, {
    status: 204,
    headers: buildCorsHeaders(origin, origins),
  });
}

export async function POST(request) {
  return handleWorkoutPlanRead({
    request,
    token: getWorkspaceToken(),
    fetchImpl: fetch,
    allowedOrigins: allowedOrigins(),
    cacheRead: readWorkoutPlanCache,
    cacheWrite: writeWorkoutPlanCache,
  });
}

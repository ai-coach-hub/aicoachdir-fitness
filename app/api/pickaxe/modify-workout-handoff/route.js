import { buildHandoffCorsHeaders, handleModifyWorkoutHandoff } from './route-core.mjs';
import { readExactAuthorizedPlan } from './authoritative-plan.mjs';
import {
  claimHandoff,
  markHandoffFailed,
  markHandoffSucceeded,
} from '../../../../lib/modify-workout-handoff-db.mjs';

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

function getDeploymentId() {
  return (process.env.PICKAXE_FITNESS_COACH_DEPLOYMENT_ID || '').trim();
}

function allowedOrigins() {
  const configured = (process.env.PICKAXE_HISTORY_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

export function OPTIONS(request) {
  const origin = request.headers.get('origin')?.trim() || '';
  const origins = allowedOrigins();
  if (!origin || !origins.has(origin)) {
    return new Response(null, {
      status: 403,
      headers: { 'Cache-Control': 'no-store', Vary: 'Origin' },
    });
  }
  return new Response(null, {
    status: 204,
    headers: buildHandoffCorsHeaders(origin, origins),
  });
}

export async function POST(request) {
  return handleModifyWorkoutHandoff({
    request,
    workspaceToken: getWorkspaceToken(),
    deploymentId: getDeploymentId(),
    fetchImpl: fetch,
    allowedOrigins: allowedOrigins(),
    readPlan: (token, auth) => readExactAuthorizedPlan(fetch, token, auth),
    claimHandoff,
    markSucceeded: markHandoffSucceeded,
    markFailed: markHandoffFailed,
  });
}

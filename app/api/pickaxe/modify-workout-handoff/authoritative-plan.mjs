import {
  collectStoredValues,
  memoryDefinitionId,
  memoryDefinitionName,
  payloadItems,
  unwrapStoredValue,
} from '../workout-plan/bridge-core.mjs';

const PICKAXE_API_BASE = 'https://api.pickaxe.co/v1';
const PLAN_MEMORY_NAMES = new Set(['fitness workout plan v1']);
const HISTORY_MEMORY_NAMES = new Set(['fitness workout history v1', 'fitness workout history for ai coach']);

function exactPlan(value, auth) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (String(value.planId || '') !== auth.planId || String(value.updatedAt || '') !== auth.planUpdatedAt) return null;
  if (!value.workouts || typeof value.workouts !== 'object' || Array.isArray(value.workouts)) return null;
  return value;
}

export function findExactAuthorizedPlan(values, auth) {
  const source = Array.isArray(values) ? values : [values];
  for (const raw of source) {
    const decoded = unwrapStoredValue(raw);
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) continue;
    for (const root of [decoded.plan, decoded.currentPlan, decoded.workoutPlan, decoded]) {
      const candidate = unwrapStoredValue(root);
      const direct = exactPlan(candidate, auth);
      if (direct) return direct;
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        const nested = unwrapStoredValue(candidate.nextPlan?.plan);
        const nestedMatch = exactPlan(nested, auth);
        if (nestedMatch) return nestedMatch;
      }
    }
  }
  return null;
}

async function pickaxeGet(fetchImpl, token, path) {
  return fetchImpl(`${PICKAXE_API_BASE}${path}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    cache: 'no-store',
    signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(20_000) : undefined,
  });
}

async function readMemory(fetchImpl, token, email, memoryId) {
  const response = await pickaxeGet(fetchImpl, token, `/studio/memory/user/${encodeURIComponent(email)}?memoryId=${encodeURIComponent(memoryId)}&skip=0&take=100`);
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`memory-read-${response.status}`);
  return collectStoredValues(await response.json(), memoryId);
}

export async function readExactAuthorizedPlan(fetchImpl, token, auth) {
  const user = await pickaxeGet(fetchImpl, token, `/studio/user/${encodeURIComponent(auth.email)}`);
  if (!user.ok) return null;

  const definitionsResponse = await pickaxeGet(fetchImpl, token, '/studio/memory/list?skip=0&take=100');
  if (!definitionsResponse.ok) throw new Error(`memory-definition-list-${definitionsResponse.status}`);
  const definitions = payloadItems(await definitionsResponse.json());
  const planDefinition = definitions.find((item) => PLAN_MEMORY_NAMES.has(memoryDefinitionName(item)));
  const historyDefinition = definitions.find((item) => HISTORY_MEMORY_NAMES.has(memoryDefinitionName(item)));
  const planMemoryId = memoryDefinitionId(planDefinition);
  const historyMemoryId = memoryDefinitionId(historyDefinition);
  if (!planMemoryId && !historyMemoryId) return null;

  const [planValues, historyValues] = await Promise.all([
    planMemoryId ? readMemory(fetchImpl, token, auth.email, planMemoryId) : Promise.resolve([]),
    historyMemoryId ? readMemory(fetchImpl, token, auth.email, historyMemoryId) : Promise.resolve([]),
  ]);
  return findExactAuthorizedPlan([...planValues, ...historyValues], auth);
}

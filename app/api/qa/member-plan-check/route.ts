import { currentUser } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE_URL = "https://api.pickaxe.co/v1";
const PLAN_MEMORY_NAMES = new Set([
  "fitness workout plan v1",
  "fitness-workout-plan-v1",
  "fitness_workout_plan_v1",
]);

type JsonRecord = Record<string, unknown>;

function normalize(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function primaryEmail(user: Awaited<ReturnType<typeof currentUser>>) {
  if (!user) return "";
  const primary = user.emailAddresses.find((item) => item.id === user.primaryEmailAddressId);
  return (primary?.emailAddress || user.emailAddresses[0]?.emailAddress || "").trim().toLowerCase();
}

function payloadItems(payload: unknown) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const root = payload as JsonRecord;
  const data = root.data;
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const rec = data as JsonRecord;
    for (const key of ["memories", "items", "results"]) {
      if (Array.isArray(rec[key])) return rec[key] as unknown[];
    }
  }
  for (const key of ["memories", "items", "results"]) {
    if (Array.isArray(root[key])) return root[key] as unknown[];
  }
  return [];
}

function containers(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const item = value as JsonRecord;
  return [item, item.definition, item.memoryDefinition, item.memory].filter(
    (entry): entry is JsonRecord => !!entry && typeof entry === "object" && !Array.isArray(entry),
  );
}

function definitionName(value: unknown) {
  for (const c of containers(value)) {
    for (const key of ["memory", "slug", "name", "tag", "goal", "title"]) {
      const n = normalize(c[key]);
      if (n) return n;
    }
  }
  return "";
}

function definitionId(value: unknown) {
  for (const c of containers(value)) {
    for (const key of ["memoryId", "id", "_id"]) {
      if (typeof c[key] === "string" && c[key]) return String(c[key]);
    }
  }
  return "";
}

function collectValues(value: unknown, out: unknown[] = []) {
  if (Array.isArray(value)) {
    value.forEach((v) => collectValues(v, out));
    return out;
  }
  if (!value || typeof value !== "object") return out;
  const rec = value as JsonRecord;
  const deleted =
    rec.isDeleted === true ||
    rec.deleted === true ||
    !!rec.deletedAt ||
    String(rec.status || "").toLowerCase() === "deleted";
  if (!deleted) {
    for (const key of ["value", "memoryValue", "memory_value"]) {
      if (key in rec) out.push(rec[key]);
    }
  }
  Object.values(rec).forEach((v) => collectValues(v, out));
  return out;
}

function unwrap(value: unknown) {
  let current = value;
  for (let i = 0; i < 5; i += 1) {
    if (typeof current === "string") {
      try {
        current = JSON.parse(current);
        continue;
      } catch {
        return current;
      }
    }
    if (!current || typeof current !== "object" || Array.isArray(current)) return current;
    const rec = current as JsonRecord;
    if ("value" in rec) {
      current = rec.value;
      continue;
    }
    if ("memoryValue" in rec) {
      current = rec.memoryValue;
      continue;
    }
    if ("memory_value" in rec) {
      current = rec.memory_value;
      continue;
    }
    return current;
  }
  return current;
}

function looksLikePlan(value: unknown) {
  const v = unwrap(value);
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const rec = v as JsonRecord;
  return !!rec.workouts && typeof rec.workouts === "object" &&
    (Array.isArray(rec.weekSchedule) || Array.isArray(rec.flexibleSequence));
}

export async function GET() {
  const user = await currentUser();
  const email = primaryEmail(user);
  if (!user || !email) {
    return Response.json({ ok: false, error: "Sign in is required." }, { status: 401 });
  }

  const token = (process.env.PICKAXE_WORKSPACE_API_TOKEN || "").trim();
  if (!token) {
    return Response.json({ ok: false, error: "Missing workspace token." }, { status: 503 });
  }

  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };

  const userResponse = await fetch(`${BASE_URL}/studio/user/${encodeURIComponent(email)}`, {
    headers,
    cache: "no-store",
  });

  const defsResponse = await fetch(`${BASE_URL}/studio/memory/list?skip=0&take=100`, {
    headers,
    cache: "no-store",
  });

  if (!defsResponse.ok) {
    return Response.json({
      ok: false,
      userLookupStatus: userResponse.status,
      definitionLookupStatus: defsResponse.status,
    }, { status: 502 });
  }

  const defs = payloadItems(await defsResponse.json());
  const planDef = defs.find((item) => PLAN_MEMORY_NAMES.has(definitionName(item)));
  const memoryId = definitionId(planDef);

  let memoryStatus = 0;
  let storedValueCount = 0;
  let formalPlanPresent = false;

  if (memoryId) {
    const memoryResponse = await fetch(
      `${BASE_URL}/studio/memory/user/${encodeURIComponent(email)}?memoryId=${encodeURIComponent(memoryId)}&skip=0&take=100`,
      { headers, cache: "no-store" },
    );
    memoryStatus = memoryResponse.status;
    if (memoryResponse.ok) {
      const payload = await memoryResponse.json();
      const values = collectValues(payload);
      storedValueCount = values.length;
      formalPlanPresent = values.some((value) => looksLikePlan(value));
    }
  }

  console.info("[pickaxe-member-plan-check]", {
    userLookupStatus: userResponse.status,
    planDefinitionPresent: !!memoryId,
    memoryStatus,
    storedValueCount,
    formalPlanPresent,
  });

  return Response.json({
    ok: true,
    userLookupStatus: userResponse.status,
    planDefinitionPresent: !!memoryId,
    memoryStatus,
    storedValueCount,
    formalPlanPresent,
  });
}

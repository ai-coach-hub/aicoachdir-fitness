import { createHmac, timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PICKAXE_API_BASE = "https://api.pickaxe.co/v1";
const HISTORY_MEMORY_NAMES = new Set([
  "fitness-workout-history-v1",
  "fitness workout history for ai coach",
]);
const MAX_BODY_BYTES = 128 * 1024;
const MAX_HISTORY_ENTRIES = 15;
const MAX_EXERCISES_PER_ENTRY = 30;
const MAX_SETS_PER_EXERCISE = 20;
const DEFAULT_ALLOWED_ORIGINS = ["https://studio.pickaxe.co"];

type JsonRecord = Record<string, unknown>;

type BridgeAuth = {
  email: string;
  planId: string;
  planUpdatedAt: string;
  signature: string;
};

type HistoryPayload = {
  schemaVersion: 1;
  updatedAt: string;
  entries: JsonRecord[];
};

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return null;
  return email;
}

function normalizeMemoryName(value: unknown) {
  if (typeof value !== "string") return null;
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getWorkspaceToken() {
  return (
    process.env.PICKAXE_WORKSPACE_API_TOKEN ||
    process.env.PICKAXE_WORKSPACE_API_KEY ||
    process.env.WORKSPACE_API_TOKEN ||
    process.env.PICKAXE_API_KEY ||
    ""
  ).trim();
}

function allowedOrigins() {
  const configured = (process.env.PICKAXE_HISTORY_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

function requestOrigin(request: Request) {
  return request.headers.get("origin")?.trim() || "";
}

function corsHeaders(origin: string) {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  if (origin && allowedOrigins().has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Max-Age"] = "600";
  }
  return headers;
}

function jsonResponse(origin: string, body: JsonRecord, status = 200) {
  return Response.json(body, { status, headers: corsHeaders(origin) });
}

function parseBridgeAuth(value: unknown): BridgeAuth | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as JsonRecord;
  const email = normalizeEmail(input.email);
  const planId = typeof input.planId === "string" ? input.planId.trim().slice(0, 200) : "";
  const planUpdatedAt =
    typeof input.planUpdatedAt === "string" ? input.planUpdatedAt.trim() : "";
  const signature = typeof input.signature === "string" ? input.signature.trim().toLowerCase() : "";

  if (
    !email ||
    !planId ||
    !planUpdatedAt ||
    Number.isNaN(new Date(planUpdatedAt).getTime()) ||
    !/^[a-f0-9]{64}$/.test(signature)
  ) {
    return null;
  }
  return { email, planId, planUpdatedAt, signature };
}

function signatureMessage(auth: Omit<BridgeAuth, "signature">) {
  return `${auth.email}\n${auth.planId}\n${auth.planUpdatedAt}`;
}

function verifyBridgeAuth(auth: BridgeAuth, token: string) {
  const expected = createHmac("sha256", token)
    .update(signatureMessage(auth), "utf8")
    .digest();
  const supplied = Buffer.from(auth.signature, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function cleanNullableText(value: unknown, maxLength: number) {
  return typeof value === "string" && value ? value.slice(0, maxLength) : null;
}

function cleanNullableNumber(value: unknown, minimum = 0, maximum = 100_000) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : null;
}

function parseIsoOrNull(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sanitizeHistory(value: unknown): HistoryPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as JsonRecord;
  if (!Array.isArray(input.entries) || input.entries.length > MAX_HISTORY_ENTRIES) return null;

  const updatedAt = parseIsoOrNull(input.updatedAt);
  if (!updatedAt) return null;

  const entries = input.entries.map((rawEntry) => {
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) return null;
    const entry = rawEntry as JsonRecord;
    if (!Array.isArray(entry.exercises) || entry.exercises.length > MAX_EXERCISES_PER_ENTRY) {
      return null;
    }

    const exercises = entry.exercises.map((rawExercise) => {
      if (!rawExercise || typeof rawExercise !== "object" || Array.isArray(rawExercise)) {
        return null;
      }
      const exercise = rawExercise as JsonRecord;
      if (!Array.isArray(exercise.sets) || exercise.sets.length > MAX_SETS_PER_EXERCISE) {
        return null;
      }

      const sets = exercise.sets.map((rawSet) => {
        if (!rawSet || typeof rawSet !== "object" || Array.isArray(rawSet)) return null;
        const set = rawSet as JsonRecord;
        return {
          weight: cleanNullableText(set.weight, 40),
          reps: cleanNullableText(set.reps, 40),
          time: cleanNullableText(set.time, 40),
          distance: cleanNullableText(set.distance, 40),
        };
      });
      if (sets.some((set) => set === null)) return null;

      return {
        id: cleanNullableText(exercise.id, 120),
        name: cleanNullableText(exercise.name, 160),
        trackingType: cleanNullableText(exercise.trackingType, 40),
        skipped: exercise.skipped === true,
        sets,
      };
    });
    if (exercises.some((exercise) => exercise === null)) return null;

    return {
      planId: cleanNullableText(entry.planId, 200),
      phase:
        entry.phase && typeof entry.phase === "object" && !Array.isArray(entry.phase)
          ? {
              name: cleanNullableText((entry.phase as JsonRecord).name, 160),
              weekNumber: cleanNullableNumber((entry.phase as JsonRecord).weekNumber, 0, 1_000),
              totalWeeks: cleanNullableNumber((entry.phase as JsonRecord).totalWeeks, 0, 1_000),
            }
          : null,
      scheduledDate: cleanNullableText(entry.scheduledDate, 40),
      workoutId: cleanNullableText(entry.workoutId, 200),
      title: cleanNullableText(entry.title, 200),
      completedAt: parseIsoOrNull(entry.completedAt),
      durationMinutes: cleanNullableNumber(entry.durationMinutes, 0, 1_440),
      difficulty: cleanNullableText(entry.difficulty, 80),
      notes: cleanText(entry.notes, 280),
      exercisesCompleted: cleanNullableNumber(entry.exercisesCompleted, 0, 100),
      exercisesSkipped: cleanNullableNumber(entry.exercisesSkipped, 0, 100),
      exercises,
    };
  });

  if (entries.some((entry) => entry === null)) return null;
  return { schemaVersion: 1, updatedAt, entries: entries as JsonRecord[] };
}

async function pickaxeRequest(token: string, path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");
  return fetch(`${PICKAXE_API_BASE}${path}`, {
    ...init,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
}

function payloadItems(payload: unknown) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const root = payload as JsonRecord;
  const data = root.data;
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const record = data as JsonRecord;
    for (const key of ["memories", "items", "results"]) {
      if (Array.isArray(record[key])) return record[key] as unknown[];
    }
  }
  for (const key of ["memories", "items", "results"]) {
    if (Array.isArray(root[key])) return root[key] as unknown[];
  }
  return [];
}

function candidateContainers(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const item = value as JsonRecord;
  return [item, item.definition, item.memoryDefinition, item.memory]
    .filter((entry): entry is JsonRecord => !!entry && typeof entry === "object" && !Array.isArray(entry));
}

function memoryDefinitionName(value: unknown) {
  for (const container of candidateContainers(value)) {
    for (const key of ["memory", "slug", "name", "tag", "goal", "title"]) {
      const normalized = normalizeMemoryName(container[key]);
      if (normalized) return normalized;
    }
  }
  return null;
}

function memoryDefinitionId(value: unknown) {
  for (const container of candidateContainers(value)) {
    for (const key of ["memoryId", "id", "_id"]) {
      if (typeof container[key] === "string" && container[key]) return container[key] as string;
    }
  }
  return null;
}

async function historyMemoryId(token: string) {
  const response = await pickaxeRequest(token, "/studio/memory/list?skip=0&take=100");
  if (!response.ok) throw new Error("memory-definition-list");
  const items = payloadItems(await response.json());
  const definition = items.find((item) => {
    const name = memoryDefinitionName(item);
    return !!name && HISTORY_MEMORY_NAMES.has(name);
  });
  const id = memoryDefinitionId(definition);
  if (!id) throw new Error("history-memory-definition");
  return id;
}

function unwrapStoredValue(value: unknown): unknown {
  let current = value;
  for (let index = 0; index < 5; index += 1) {
    if (typeof current === "string") {
      try {
        current = JSON.parse(current);
        continue;
      } catch {
        return current;
      }
    }
    if (!current || typeof current !== "object" || Array.isArray(current)) return current;
    const record = current as JsonRecord;
    if ("value" in record) {
      current = record.value;
      continue;
    }
    if ("memoryValue" in record) {
      current = record.memoryValue;
      continue;
    }
    if ("memory_value" in record) {
      current = record.memory_value;
      continue;
    }
    return current;
  }
  return current;
}

function collectStoredValues(value: unknown, result: unknown[] = []) {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectStoredValues(entry, result));
    return result;
  }
  if (!value || typeof value !== "object") return result;
  const record = value as JsonRecord;
  const deleted =
    record.isDeleted === true ||
    record.deleted === true ||
    !!record.deletedAt ||
    String(record.status || "").toLowerCase() === "deleted";
  if (!deleted) {
    for (const key of ["value", "memoryValue", "memory_value"]) {
      if (key in record) result.push(unwrapStoredValue(record[key]));
    }
  }
  Object.values(record).forEach((entry) => collectStoredValues(entry, result));
  return result;
}

async function readHistory(token: string, email: string, memoryId: string) {
  const response = await pickaxeRequest(
    token,
    `/studio/memory/user/${encodeURIComponent(email)}?memoryId=${encodeURIComponent(memoryId)}&skip=0&take=100`,
  );
  if (response.status === 404) return [];
  if (!response.ok) throw new Error("history-memory-read");
  return collectStoredValues(await response.json());
}

async function saveHistory(token: string, email: string, memoryId: string, history: HistoryPayload) {
  const storedValue = JSON.stringify(history);
  const existing = await readHistory(token, email, memoryId);
  const response = existing.length
    ? await pickaxeRequest(
        token,
        `/studio/memory/user/${encodeURIComponent(email)}/${encodeURIComponent(memoryId)}`,
        { method: "PATCH", body: JSON.stringify({ data: { value: storedValue } }) },
      )
    : await pickaxeRequest(token, "/studio/memory/user/create", {
        method: "POST",
        body: JSON.stringify({ userId: email, memoryId, value: storedValue }),
      });

  if (!response.ok) throw new Error("history-memory-write");

  const readBack = await readHistory(token, email, memoryId);
  const verified = readBack.some((value) => {
    const decoded = unwrapStoredValue(value);
    return (
      !!decoded &&
      typeof decoded === "object" &&
      !Array.isArray(decoded) &&
      (decoded as JsonRecord).updatedAt === history.updatedAt
    );
  });
  if (!verified) throw new Error("history-memory-verification");
}

export function OPTIONS(request: Request) {
  const origin = requestOrigin(request);
  if (!origin || !allowedOrigins().has(origin)) {
    return jsonResponse(origin, { ok: false, message: "Origin not allowed." }, 403);
  }
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(request: Request) {
  const origin = requestOrigin(request);
  if (!origin || !allowedOrigins().has(origin)) {
    return jsonResponse(origin, { ok: false, message: "Origin not allowed." }, 403);
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse(origin, { ok: false, message: "Workout history is too large." }, 413);
  }

  const token = getWorkspaceToken();
  if (!token) {
    console.error("Pickaxe workout-history bridge is missing its server credential.");
    return jsonResponse(origin, { ok: false, message: "Coach sync is not configured." }, 503);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(origin, { ok: false, message: "Invalid request." }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse(origin, { ok: false, message: "Invalid request." }, 400);
  }

  const input = body as JsonRecord;
  const auth = parseBridgeAuth(input.auth);
  const history = sanitizeHistory(input.history);
  if (!auth || !history || !verifyBridgeAuth(auth, token)) {
    return jsonResponse(origin, { ok: false, message: "Workout sync authorization failed." }, 401);
  }

  if (history.entries.some((entry) => entry.planId && entry.planId !== auth.planId)) {
    return jsonResponse(origin, { ok: false, message: "Workout history does not match this plan." }, 400);
  }

  try {
    const memoryId = await historyMemoryId(token);
    await saveHistory(token, auth.email, memoryId, history);
    return jsonResponse(origin, { ok: true, savedAt: history.updatedAt });
  } catch {
    console.error("Pickaxe workout-history bridge failed.");
    return jsonResponse(origin, { ok: false, message: "Workout history could not be verified." }, 502);
  }
}

const PICKAXE_API_BASE = "https://api.pickaxe.co/v1";

export const FITNESS_ACCESS_GROUP_ID =
  "access-b232b0a3-4713-45b4-a7ab-3daba2faa4d9";

function token() {
  const value = process.env.PICKAXE_WORKSPACE_API_TOKEN?.trim();
  if (!value) throw new Error("Pickaxe workspace token is not configured.");
  return value;
}

async function pickaxeRequest(
  path: string,
  init: { method?: "GET" | "POST" | "PATCH"; body?: unknown } = {},
) {
  const method = init.method || "GET";
  const response = await fetch(`${PICKAXE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: "application/json",
      ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
    },
    ...(method !== "GET" && init.body !== undefined
      ? { body: JSON.stringify(init.body) }
      : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  return { response, payload };
}

function unwrapData(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const record = payload as Record<string, unknown>;
  return record.data ?? payload;
}

function objectContainsValue(value: unknown, target: string): boolean {
  if (value === target) return true;
  if (Array.isArray(value)) return value.some((entry) => objectContainsValue(entry, target));
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).some((entry) =>
    objectContainsValue(entry, target),
  );
}

function previewMembershipHints(value: unknown) {
  const hints: Array<{ path: string; value: string }> = [];
  const keyPattern = /access|group|product|membership|plan|subscription|role|tier/i;

  function walk(current: unknown, path: string, depth: number) {
    if (depth > 5 || current == null) return;

    if (Array.isArray(current)) {
      current.slice(0, 20).forEach((item, index) =>
        walk(item, `${path}[${index}]`, depth + 1),
      );
      return;
    }

    if (typeof current !== "object") return;

    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (
        keyPattern.test(key) &&
        (typeof child === "string" ||
          typeof child === "number" ||
          typeof child === "boolean" ||
          child == null)
      ) {
        hints.push({ path: nextPath, value: String(child) });
      }
      walk(child, nextPath, depth + 1);
    }
  }

  walk(value, "", 0);
  return hints.slice(0, 60);
}

function normalizedEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

async function findPickaxeUserInList(email: string) {
  const target = normalizedEmail(email);

  for (let skip = 0; skip < 1000; skip += 100) {
    const { response, payload } = await pickaxeRequest(
      `/studio/user/list?skip=${skip}&take=100`,
    );
    if (!response.ok) {
      throw new Error(`Pickaxe user list lookup failed with ${response.status}`);
    }

    const unwrapped = unwrapData(payload);
    const users = Array.isArray(unwrapped)
      ? unwrapped
      : unwrapped &&
          typeof unwrapped === "object" &&
          Array.isArray((unwrapped as Record<string, unknown>).items)
        ? ((unwrapped as Record<string, unknown>).items as unknown[])
        : [];

    const match = users.find((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const record = item as Record<string, unknown>;
      return normalizedEmail(record.email) === target;
    });

    if (match) return match;
    if (users.length < 100) break;
  }

  return null;
}

export async function getPickaxeUser(email: string) {
  const { response, payload } = await pickaxeRequest(
    `/studio/user/${encodeURIComponent(email)}`,
  );

  if (response.status === 404) {
    const listed = await findPickaxeUserInList(email);
    if (process.env.VERCEL_ENV === "preview" && !listed) {
      console.warn("[pickaxe-access-qa] user-not-found-in-direct-or-list");
    }
    return listed;
  }

  if (!response.ok) {
    throw new Error(`Pickaxe user lookup failed with ${response.status}`);
  }

  return unwrapData(payload);
}

function derivedProductIds(payload: unknown) {
  const found = new Set<string>();

  function walk(value: unknown, depth: number) {
    if (depth > 6 || value == null) return;

    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, depth + 1));
      return;
    }

    if (typeof value !== "object") return;

    const record = value as Record<string, unknown>;
    const ids = record.derivedFromProductIds;
    if (Array.isArray(ids)) {
      ids.forEach((item) => {
        const id = String(item || "").trim();
        if (id) found.add(id);
      });
    }

    Object.values(record).forEach((item) => walk(item, depth + 1));
  }

  walk(payload, 0);
  return Array.from(found);
}

async function fitnessLegacyProductIds() {
  const { response, payload } = await pickaxeRequest(
    `/studio/access-group/${encodeURIComponent(FITNESS_ACCESS_GROUP_ID)}`,
  );
  if (!response.ok) return [];
  return derivedProductIds(payload);
}

export async function pickaxeUserHasFitnessAccess(email: string) {
  const user = await getPickaxeUser(email);
  if (!user) return false;

  if (objectContainsValue(user, FITNESS_ACCESS_GROUP_ID)) {
    return true;
  }

  // Pickaxe's older member records may still reference the legacy product IDs
  // that were migrated into the current access group. The current API exposes
  // those IDs through derivedFromProductIds on the access group.
  const legacyProductIds = await fitnessLegacyProductIds();
  const legacyMatch = legacyProductIds.some((productId) =>
    objectContainsValue(user, productId),
  );

  if (process.env.VERCEL_ENV === "preview") {
    console.warn(
      `[pickaxe-access-qa] ${JSON.stringify({
        hasCurrentAccessGroup: false,
        legacyProductIds,
        legacyMatch,
        hints: previewMembershipHints(user),
      })}`,
    );
  }

  return legacyMatch;
}

export async function grantFitnessAccess(email: string, name?: string) {
  const existing = await getPickaxeUser(email);

  if (existing) {
    const { response } = await pickaxeRequest(
      `/studio/user/${encodeURIComponent(email)}`,
      {
        method: "PATCH",
        body: {
          data: {
            accessGroupId: FITNESS_ACCESS_GROUP_ID,
            isEmailVerified: true,
            ...(name ? { name } : {}),
          },
        },
      },
    );
    if (!response.ok) {
      throw new Error(`Pickaxe access grant failed with ${response.status}`);
    }
    return;
  }

  const { response } = await pickaxeRequest("/studio/user/create", {
    method: "POST",
    body: {
      email,
      accessGroupId: FITNESS_ACCESS_GROUP_ID,
      isEmailVerified: true,
      ...(name ? { name } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Pickaxe user creation failed with ${response.status}`);
  }
}

async function publicFallbackAccessGroupId() {
  const { response, payload } = await pickaxeRequest("/studio/access-group/list");
  if (!response.ok) {
    throw new Error(`Pickaxe access-group lookup failed with ${response.status}`);
  }

  const unwrapped = unwrapData(payload);
  const groups = Array.isArray(unwrapped) ? unwrapped : [];
  const publicGroups = groups.filter((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    return String((item as Record<string, unknown>).type || "") === "public";
  }) as Record<string, unknown>[];

  const preferred =
    publicGroups.find((item) => Number(item.limit) === -1337) ||
    publicGroups.find((item) => item.limit == null) ||
    publicGroups[0];

  return String(
    preferred?.id || preferred?.accessGroupId || preferred?._id || "",
  ).trim();
}

export async function revokeFitnessAccess(email: string) {
  const existing = await getPickaxeUser(email);
  if (!existing) return;

  const fallbackId = await publicFallbackAccessGroupId();
  if (!fallbackId) {
    throw new Error("No Pickaxe public fallback access group was found.");
  }

  const { response } = await pickaxeRequest(
    `/studio/user/${encodeURIComponent(email)}`,
    {
      method: "PATCH",
      body: { data: { accessGroupId: fallbackId } },
    },
  );

  if (!response.ok) {
    throw new Error(`Pickaxe access revoke failed with ${response.status}`);
  }
}

type UnknownRecord = Record<string, unknown>;

type AccessGroup = UnknownRecord & {
  id?: string;
  accessGroupId?: string;
  type?: string;
  name?: string;
  displayName?: string;
  description?: string;
  displayDescription?: string;
  limit?: number;
  limitInterval?: string | null;
  isArchived?: boolean;
  derivedFromProductIds?: unknown[];
};

export type FitnessAccessResult = {
  ok: boolean;
  email: string;
  hasFitnessAccess: boolean;
  reason:
    | "verified"
    | "pickaxe_user_not_found"
    | "fitness_entitlement_not_found"
    | "fitness_group_not_identified"
    | "pickaxe_unavailable"
    | "server_configuration";
  verificationMethod?: string;
  accessSummary?: {
    boughtProducts: number;
    giftedProducts: number;
  };
};

const PICKAXE_API_BASE = "https://api.pickaxe.co/v1";
const FITNESS_PLAN_LIMIT = 400;
const FITNESS_PLAN_INTERVAL = "month";
const ACCESS_GROUP_CACHE_MS = 5 * 60 * 1000;

let accessGroupCache:
  | { expiresAt: number; groups: AccessGroup[] }
  | null = null;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];

  const candidates = [
    payload.data,
    payload.accessGroups,
    payload.groups,
    payload.products,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function groupId(group: AccessGroup): string | null {
  return asString(group.accessGroupId) ?? asString(group.id);
}

function extractIds(value: unknown): string[] {
  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(extractIds);
  }

  if (!isRecord(value)) return [];

  return [
    value.accessGroupId,
    value.productId,
    value.id,
    value._id,
  ]
    .map(asString)
    .filter((item): item is string => Boolean(item));
}

function groupSearchText(group: AccessGroup): string {
  return [
    group.name,
    group.displayName,
    group.description,
    group.displayDescription,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

function looksLikeFitnessGroup(group: AccessGroup): boolean {
  if (group.isArchived === true) return false;

  const type = asString(group.type)?.toLowerCase();
  if (type && type !== "members" && type !== "invite_only") return false;

  const textMatchesFitness = groupSearchText(group).includes("fitness");
  const limitMatches =
    group.limit === undefined || group.limit === FITNESS_PLAN_LIMIT;
  const intervalMatches =
    group.limitInterval === undefined ||
    group.limitInterval === null ||
    group.limitInterval === FITNESS_PLAN_INTERVAL;

  return textMatchesFitness && limitMatches && intervalMatches;
}

function unique400MonthlyMemberGroup(groups: AccessGroup[]): AccessGroup | null {
  const matches = groups.filter((group) => {
    if (group.isArchived === true) return false;
    if (asString(group.type)?.toLowerCase() !== "members") return false;

    return (
      group.limit === FITNESS_PLAN_LIMIT &&
      group.limitInterval === FITNESS_PLAN_INTERVAL
    );
  });

  return matches.length === 1 ? matches[0] : null;
}

async function fetchAccessGroups(apiKey: string): Promise<AccessGroup[] | null> {
  if (accessGroupCache && accessGroupCache.expiresAt > Date.now()) {
    return accessGroupCache.groups;
  }

  const response = await fetch(`${PICKAXE_API_BASE}/studio/access-group/list`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) return null;

  const payload = await response.json();
  const groups = normalizeList(payload).filter(isRecord) as AccessGroup[];

  accessGroupCache = {
    groups,
    expiresAt: Date.now() + ACCESS_GROUP_CACHE_MS,
  };

  return groups;
}

export async function verifyFitnessAccess(
  email: string
): Promise<FitnessAccessResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const apiKey = process.env.PICKAXE_WORKSPACE_API_KEY;

  if (!apiKey) {
    return {
      ok: false,
      email: normalizedEmail,
      hasFitnessAccess: false,
      reason: "server_configuration",
    };
  }

  try {
    const userResponse = await fetch(
      `${PICKAXE_API_BASE}/studio/user/${encodeURIComponent(normalizedEmail)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    if (userResponse.status === 404) {
      return {
        ok: true,
        email: normalizedEmail,
        hasFitnessAccess: false,
        reason: "pickaxe_user_not_found",
      };
    }

    if (!userResponse.ok) {
      console.error("Pickaxe user lookup failed.", userResponse.status);
      return {
        ok: false,
        email: normalizedEmail,
        hasFitnessAccess: false,
        reason: "pickaxe_unavailable",
      };
    }

    const userPayload = await userResponse.json();
    const pickaxeUser = isRecord(userPayload?.data)
      ? userPayload.data
      : isRecord(userPayload?.user)
        ? userPayload.user
        : isRecord(userPayload)
          ? userPayload
          : {};

    const boughtProducts = Array.isArray(pickaxeUser.boughtProducts)
      ? pickaxeUser.boughtProducts
      : [];
    const giftedProducts = Array.isArray(pickaxeUser.giftedProducts)
      ? pickaxeUser.giftedProducts
      : [];

    const userEntitlementIds = new Set([
      ...extractIds(pickaxeUser.accessGroupId),
      ...extractIds(pickaxeUser.accessGroupIds),
      ...extractIds(boughtProducts),
      ...extractIds(giftedProducts),
    ]);

    const groups = await fetchAccessGroups(apiKey);

    if (!groups) {
      return {
        ok: false,
        email: normalizedEmail,
        hasFitnessAccess: false,
        reason: "pickaxe_unavailable",
        accessSummary: {
          boughtProducts: boughtProducts.length,
          giftedProducts: giftedProducts.length,
        },
      };
    }

    const configuredGroupId = asString(
      process.env.PICKAXE_FITNESS_ACCESS_GROUP_ID
    );

    let targetGroup: AccessGroup | null = null;
    let verificationMethod = "";

    if (configuredGroupId) {
      targetGroup =
        groups.find((group) => groupId(group) === configuredGroupId) ?? null;
      verificationMethod = "configured_access_group";
    } else {
      const namedFitnessGroups = groups.filter(looksLikeFitnessGroup);

      if (namedFitnessGroups.length === 1) {
        targetGroup = namedFitnessGroups[0];
        verificationMethod = "unique_fitness_access_group";
      } else if (namedFitnessGroups.length > 1) {
        const exactPlanMatches = namedFitnessGroups.filter(
          (group) =>
            group.limit === FITNESS_PLAN_LIMIT &&
            group.limitInterval === FITNESS_PLAN_INTERVAL
        );

        if (exactPlanMatches.length === 1) {
          targetGroup = exactPlanMatches[0];
          verificationMethod = "fitness_400_monthly_access_group";
        }
      } else {
        targetGroup = unique400MonthlyMemberGroup(groups);
        if (targetGroup) {
          verificationMethod = "unique_400_monthly_member_group";
        }
      }
    }

    if (!targetGroup) {
      return {
        ok: true,
        email: normalizedEmail,
        hasFitnessAccess: false,
        reason: "fitness_group_not_identified",
        accessSummary: {
          boughtProducts: boughtProducts.length,
          giftedProducts: giftedProducts.length,
        },
      };
    }

    const targetIds = new Set<string>();
    const targetAccessGroupId = groupId(targetGroup);

    if (targetAccessGroupId) targetIds.add(targetAccessGroupId);

    for (const legacyId of extractIds(targetGroup.derivedFromProductIds)) {
      targetIds.add(legacyId);
    }

    const hasFitnessAccess = [...userEntitlementIds].some((id) =>
      targetIds.has(id)
    );

    return {
      ok: true,
      email: normalizedEmail,
      hasFitnessAccess,
      reason: hasFitnessAccess ? "verified" : "fitness_entitlement_not_found",
      verificationMethod,
      accessSummary: {
        boughtProducts: boughtProducts.length,
        giftedProducts: giftedProducts.length,
      },
    };
  } catch {
    console.error("Pickaxe membership verification failed.");
    return {
      ok: false,
      email: normalizedEmail,
      hasFitnessAccess: false,
      reason: "pickaxe_unavailable",
    };
  }
}

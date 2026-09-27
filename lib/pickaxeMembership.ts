export const FITNESS_ACCESS_GROUP_ID =
  "access-b232b0a3-4713-45b4-a7ab-3daba2faa4d9";

function containsExactAccessGroupId(value: unknown): boolean {
  if (value === FITNESS_ACCESS_GROUP_ID) return true;
  if (Array.isArray(value)) return value.some(containsExactAccessGroupId);
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).some(containsExactAccessGroupId);
}

export async function getFitnessMembership(email: string) {
  const token = process.env.PICKAXE_WORKSPACE_API_TOKEN?.trim();
  if (!token) {
    return { configured: false, exists: false, active: false };
  }

  const response = await fetch(
    `https://api.pickaxe.co/v1/studio/user/${encodeURIComponent(email)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    },
  );

  if (response.status === 404) {
    return { configured: true, exists: false, active: false };
  }

  if (!response.ok) {
    throw new Error(`Pickaxe user lookup failed with ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  const user =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? ((payload as Record<string, unknown>).data ?? payload)
      : payload;

  return {
    configured: true,
    exists: true,
    active: containsExactAccessGroupId(user),
  };
}

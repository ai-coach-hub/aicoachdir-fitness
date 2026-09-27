import { createHash } from "node:crypto";

const PREVIEW_QA_ALIAS_SHA256 =
  "fb98dbca40d1cab4a8abbe06bbc46f349ba8462c47de3826919f5359de8c5030";

export function canonicalMemberEmail(value: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || process.env.VERCEL_ENV !== "preview") return normalized;

  const digest = createHash("sha256").update(normalized, "utf8").digest("hex");
  if (digest !== PREVIEW_QA_ALIAS_SHA256) return normalized;

  return normalized.replace("+clerk_test@", "@");
}

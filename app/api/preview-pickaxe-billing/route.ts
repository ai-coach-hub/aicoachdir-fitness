import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ACCESS_GROUP_ID = "access-b232b0a3-4713-45b4-a7ab-3daba2faa4d9";

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (/stripe|price|product|currency|amount|plan|payment|billing|subscription/i.test(key)) {
      result[key] = sanitize(entry);
    } else if (entry && typeof entry === "object") {
      const nested = sanitize(entry);
      if (nested && typeof nested === "object" && Object.keys(nested as Record<string, unknown>).length) {
        result[key] = nested;
      }
    }
  }
  return result;
}

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") return new NextResponse(null, { status: 404 });
  const token = process.env.PICKAXE_WORKSPACE_API_TOKEN?.trim();
  if (!token) return NextResponse.json({ ok:false }, { status:503 });

  const response = await fetch(
    `https://api.pickaxe.co/v1/studio/access-group/${ACCESS_GROUP_ID}`,
    {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    },
  );
  const data = await response.json().catch(() => null);
  return NextResponse.json(
    { ok: response.ok, status: response.status, billing: sanitize(data) },
    { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } },
  );
}

import { NextResponse } from "next/server";
import {
  FITNESS_INCLUDED_USES,
  FITNESS_PLAN,
  FITNESS_PRICE,
  TERMS_ACCEPTANCE_TEXT,
  TERMS_PATH,
  TERMS_SOURCE_PATH,
  TERMS_VERSION,
} from "@/lib/termsAcceptance";
import { ensureTermsAcceptanceSchema } from "@/lib/termsAcceptanceDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_USER_AGENT_LENGTH = 1024;

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

function parseClientAcceptedAt(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function getRequestIp(request: Request) {
  const vercelForwardedFor = request.headers.get("x-vercel-forwarded-for");
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const raw = vercelForwardedFor || forwardedFor || realIp || "";
  const ip = raw.split(",")[0]?.trim();
  return ip ? ip.slice(0, 128) : null;
}

function getUserAgent(request: Request) {
  const value = request.headers.get("user-agent")?.trim();
  return value ? value.slice(0, MAX_USER_AGENT_LENGTH) : null;
}

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { ok: false, message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 4096) {
    return jsonError("Please check your information and try again.", 413);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("Please check your information and try again.", 400);
  }

  if (!body || typeof body !== "object") {
    return jsonError("Please check your information and try again.", 400);
  }

  const input = body as Record<string, unknown>;
  const email = normalizeEmail(input.email);
  const clientAcceptedAt = parseClientAcceptedAt(input.clientAcceptedAt);

  if (!email) {
    return jsonError("Please enter a valid email address.", 400);
  }

  if (!clientAcceptedAt) {
    return jsonError("Please try again so we can record the time of your agreement.", 400);
  }

  const acceptanceId = crypto.randomUUID();
  const ipAddress = getRequestIp(request);
  const userAgent = getUserAgent(request);
  const requestUrl = new URL(request.url);
  const termsUrl = new URL(TERMS_PATH, requestUrl.origin).toString();
  const vercelGitCommitSha = process.env.VERCEL_GIT_COMMIT_SHA || null;
  const vercelDeploymentId = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL || null;

  try {
    const sql = await ensureTermsAcceptanceSchema();

    // Reasonable abuse protection using durable data rather than function memory.
    const recentEmailRows = await sql`
      SELECT COUNT(*)::int AS count
      FROM terms_acceptances
      WHERE email = ${email}
        AND accepted_at >= NOW() - INTERVAL '10 minutes'
    `;
    const recentEmailCount = Number(recentEmailRows[0]?.count || 0);

    if (recentEmailCount >= 8) {
      return jsonError("Too many recent attempts. Please wait a few minutes and try again.", 429);
    }

    if (ipAddress) {
      const recentIpRows = await sql`
        SELECT COUNT(*)::int AS count
        FROM terms_acceptances
        WHERE ip_address = ${ipAddress}
          AND accepted_at >= NOW() - INTERVAL '10 minutes'
      `;
      const recentIpCount = Number(recentIpRows[0]?.count || 0);

      if (recentIpCount >= 30) {
        return jsonError("Too many recent attempts. Please wait a few minutes and try again.", 429);
      }
    }

    const rows = await sql`
      INSERT INTO terms_acceptances (
        id,
        email,
        client_accepted_at,
        terms_version,
        acceptance_text,
        plan,
        price,
        included_uses,
        terms_url,
        source_path,
        ip_address,
        user_agent,
        vercel_git_commit_sha,
        vercel_deployment_id
      ) VALUES (
        ${acceptanceId}::uuid,
        ${email},
        ${clientAcceptedAt}::timestamptz,
        ${TERMS_VERSION},
        ${TERMS_ACCEPTANCE_TEXT},
        ${FITNESS_PLAN},
        ${FITNESS_PRICE},
        ${FITNESS_INCLUDED_USES},
        ${termsUrl},
        ${TERMS_SOURCE_PATH},
        ${ipAddress},
        ${userAgent},
        ${vercelGitCommitSha},
        ${vercelDeploymentId}
      )
      RETURNING id::text AS id, accepted_at
    `;

    const stored = rows[0];
    if (!stored?.id || !stored?.accepted_at) {
      return jsonError("We couldn't record your agreement. Please try again. You have not been charged.", 500);
    }

    return NextResponse.json(
      {
        ok: true,
        acceptanceId: String(stored.id),
        acceptedAt: new Date(stored.accepted_at as string | Date).toISOString(),
      },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch {
    // Intentionally avoid logging request data, database errors, credentials, or stack traces.
    console.error("Terms acceptance storage failed.");
    return jsonError("We couldn't record your agreement. Please try again. You have not been charged.", 500);
  }
}

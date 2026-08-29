import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentFitnessMember } from "@/lib/currentFitnessMember";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PICKAXE_COMPLETIONS_URL = "https://api.pickaxe.co/v1/completions";
const MAX_MESSAGE_LENGTH = 8000;
const THREAD_ID_PATTERN = /^[a-zA-Z0-9_-]{8,120}$/;

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function cleanMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const message = value.trim();
  if (!message || message.length > MAX_MESSAGE_LENGTH) return null;
  return message;
}

function cleanThreadId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const threadId = value.trim();
  return THREAD_ID_PATTERN.test(threadId) ? threadId : null;
}

function pickaxeConversationId(userId: string, threadId: string) {
  return createHash("sha256")
    .update(`${userId}:${threadId}`)
    .digest("hex");
}

function extractReply(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;

  if (typeof record.result === "string" && record.result.trim()) {
    return record.result.trim();
  }

  if (typeof record.response === "string" && record.response.trim()) {
    return record.response.trim();
  }

  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }

  if (record.data && typeof record.data === "object") {
    const data = record.data as Record<string, unknown>;
    if (typeof data.result === "string" && data.result.trim()) {
      return data.result.trim();
    }
  }

  return null;
}

export async function POST(request: Request) {
  const member = await getCurrentFitnessMember();

  if (!member.authenticated) {
    return noStoreJson(
      { ok: false, error: "Sign in is required." },
      401
    );
  }

  if (!member.membershipCheckOk) {
    return noStoreJson(
      { ok: false, error: "Unable to verify Fitness Coach membership right now." },
      503
    );
  }

  if (!member.hasFitnessAccess || !member.email || !member.userId) {
    return noStoreJson(
      { ok: false, error: "An active Fitness Coach membership is required." },
      403
    );
  }

  const deploymentToken = process.env.PICKAXE_FITNESS_DEPLOYMENT_TOKEN;

  if (!deploymentToken) {
    console.error("PICKAXE_FITNESS_DEPLOYMENT_TOKEN is not configured.");
    return noStoreJson(
      { ok: false, error: "Fitness Coach chat is not configured yet." },
      503
    );
  }

  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return noStoreJson({ ok: false, error: "Invalid request." }, 400);
  }

  const message = cleanMessage(body.message);
  const threadId = cleanThreadId(body.threadId);

  if (!message || !threadId) {
    return noStoreJson(
      { ok: false, error: "Message or conversation information is invalid." },
      400
    );
  }

  // Keep Pickaxe's conversation key compact and format-safe while still
  // scoping the browser's random thread to the authenticated Clerk user.
  const conversationId = pickaxeConversationId(member.userId, threadId);

  try {
    const response = await fetch(PICKAXE_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${deploymentToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        userId: member.email,
        conversationId,
        stream: false,
      }),
      cache: "no-store",
    });

    let payload: unknown = null;

    try {
      payload = await response.json();
    } catch {
      // Preserve the HTTP status below without exposing raw upstream content.
    }

    const payloadRecord =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : null;

    if (!response.ok || payloadRecord?.success === false) {
      console.error(
        "Pickaxe Fitness completion failed.",
        response.status,
        typeof payloadRecord?.error === "string" ? payloadRecord.error : ""
      );

      if (response.status === 401 || response.status === 403) {
        return noStoreJson(
          { ok: false, error: "Fitness Coach access could not be authorized." },
          403
        );
      }

      return noStoreJson(
        { ok: false, error: "The Fitness Coach is temporarily unavailable." },
        502
      );
    }

    const reply = extractReply(payload);

    if (!reply) {
      console.error("Pickaxe Fitness completion returned no readable reply.");
      return noStoreJson(
        { ok: false, error: "The Fitness Coach returned an empty response." },
        502
      );
    }

    return noStoreJson({
      ok: true,
      reply,
      threadId,
    });
  } catch {
    console.error("Pickaxe Fitness completion request failed.");
    return noStoreJson(
      { ok: false, error: "The Fitness Coach is temporarily unavailable." },
      502
    );
  }
}

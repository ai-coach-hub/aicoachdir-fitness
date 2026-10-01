import { currentUser } from "@clerk/nextjs/server";
import { canonicalMemberEmail } from "@/lib/memberIdentity";
import { memberHasFitnessAccess } from "@/lib/fitnessMembershipDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PICKAXE_STUDIO_BASE_URL = "https://api.pickaxe.co/v1";

type HistoryMessage = {
  role: "user" | "assistant";
  text: string;
};

type HistoryThread = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: HistoryMessage[];
};

function primaryEmailForUser(user: Awaited<ReturnType<typeof currentUser>>) {
  if (!user) return "";
  const primaryId = user.primaryEmailAddressId;
  const primary = user.emailAddresses.find((item) => item.id === primaryId);
  return canonicalMemberEmail(
    primary?.emailAddress || user.emailAddresses[0]?.emailAddress || "",
  );
}

function getStudioToken() {
  return (process.env.PICKAXE_WORKSPACE_API_TOKEN || "").trim();
}

function normalizedIdentifier(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function userRecordFromPayload(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const data = record.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return record;
}

function historyIdentifierAliases(value: unknown, memberEmail: string) {
  const aliases = new Set<string>([memberEmail.toLowerCase()]);
  const record = userRecordFromPayload(value);
  if (!record) return [...aliases];

  for (const key of ["id", "_id", "userId", "userID", "uid", "identifier", "email"]) {
    const candidate = normalizedIdentifier(record[key]);
    if (candidate) aliases.add(candidate);
  }

  return [...aliases].slice(0, 6);
}

async function resolveHistoryUserIdentifiers(memberEmail: string, studioToken: string) {
  try {
    const response = await fetch(
      `${PICKAXE_STUDIO_BASE_URL}/studio/user/${encodeURIComponent(memberEmail)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${studioToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!response.ok) {
      console.info("[fitness-chat-history] user-alias-lookup", {
        status: response.status,
        fallbackToEmail: true,
      });
      return [memberEmail.toLowerCase()];
    }

    return historyIdentifierAliases(await response.json(), memberEmail);
  } catch (error) {
    console.info("[fitness-chat-history] user-alias-lookup-failed", {
      fallbackToEmail: true,
      message: error instanceof Error ? error.message : String(error),
    });
    return [memberEmail.toLowerCase()];
  }
}

function stringFromUnknown(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  if (Array.isArray(value)) {
    return value
      .map((item) => stringFromUnknown(item))
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  for (const key of ["text", "content", "message", "value", "output", "result"]) {
    const text = stringFromUnknown(record[key]);
    if (text) return text;
  }

  return "";
}

function normalizedRole(value: unknown): "user" | "assistant" | null {
  const role = String(value || "").trim().toLowerCase();
  if (["user", "human", "member", "customer"].includes(role)) return "user";
  if (["assistant", "ai", "coach", "bot"].includes(role)) return "assistant";
  return null;
}

function parseMessages(value: unknown): HistoryMessage[] {
  if (!Array.isArray(value)) return [];

  const parsed: HistoryMessage[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const role =
      normalizedRole(record.role) ||
      normalizedRole(record.sender) ||
      normalizedRole(record.author) ||
      normalizedRole(record.type);
    if (!role) continue;

    const text =
      stringFromUnknown(record.content) ||
      stringFromUnknown(record.text) ||
      stringFromUnknown(record.message) ||
      stringFromUnknown(record.value);
    if (!text) continue;

    parsed.push({ role, text });
  }

  return parsed;
}

function fallbackMessages(record: Record<string, unknown>): HistoryMessage[] {
  const messages: HistoryMessage[] = [];
  const userText =
    stringFromUnknown(record.prompt) ||
    stringFromUnknown(record.input) ||
    stringFromUnknown(record.question) ||
    stringFromUnknown(record.message);
  const assistantText =
    stringFromUnknown(record.response) ||
    stringFromUnknown(record.output) ||
    stringFromUnknown(record.result) ||
    stringFromUnknown(record.answer);

  if (userText) messages.push({ role: "user", text: userText });
  if (assistantText) messages.push({ role: "assistant", text: assistantText });
  return messages;
}

function threadTitle(messages: HistoryMessage[]) {
  const firstUser = messages.find((message) => message.role === "user")?.text || "";
  const oneLine = firstUser.replace(/\s+/g, " ").trim();
  if (!oneLine) return "Previous chat";
  return oneLine.length > 80 ? `${oneLine.slice(0, 77)}...` : oneLine;
}

function normalizeThread(value: unknown, expectedUserIds: string[]): HistoryThread | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const userId = normalizedIdentifier(record.userId || record.user);
  if (!expectedUserIds.includes(userId)) return null;

  const id = String(record.responseId || record.sessionId || record.id || "").trim();
  if (!id) return null;

  const messages = parseMessages(record.messages);
  const normalizedMessages = messages.length ? messages : fallbackMessages(record);
  if (!normalizedMessages.length) return null;

  return {
    id,
    title: threadTitle(normalizedMessages),
    createdAt: String(record.createdAt || ""),
    updatedAt: String(record.updatedAt || record.createdAt || ""),
    messages: normalizedMessages,
  };
}

export async function GET() {
  const user = await currentUser();
  const memberEmail = primaryEmailForUser(user);
  if (!user || !memberEmail) {
    return Response.json({ ok: false, error: "Sign in is required." }, { status: 401 });
  }

  try {
    const active = await memberHasFitnessAccess(memberEmail, user.id);
    if (!active) {
      return Response.json(
        { ok: false, error: "An active Fitness Coach membership is required." },
        { status: 403 },
      );
    }
  } catch {
    return Response.json(
      { ok: false, error: "Fitness membership verification is temporarily unavailable." },
      { status: 503 },
    );
  }

  const studioToken = getStudioToken();
  if (!studioToken) {
    return Response.json(
      { ok: false, error: "Chat history is not configured." },
      { status: 503 },
    );
  }

  try {
    const historyIdentifiers = await resolveHistoryUserIdentifiers(memberEmail, studioToken);
    const response = await fetch(`${PICKAXE_STUDIO_BASE_URL}/studio/workspace/history`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${studioToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        users: historyIdentifiers,
        skip: 0,
        limit: 50,
        format: "messages",
        sortBy: "updated-desc",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      return Response.json(
        { ok: false, error: "Previous chats could not be loaded." },
        { status: 502 },
      );
    }

    const payload = (await response.json()) as { data?: unknown[] };
    const threads = (Array.isArray(payload.data) ? payload.data : [])
      .map((item) => normalizeThread(item, historyIdentifiers))
      .filter((item): item is HistoryThread => !!item);

    return Response.json({
      ok: true,
      threads,
      memberAuthenticated: true,
    });
  } catch (error) {
    console.error("[fitness-chat-history] read-failed", {
      message: error instanceof Error ? error.message : String(error),
    });

    return Response.json(
      { ok: false, error: "Previous chats could not be loaded." },
      { status: 502 },
    );
  }
}

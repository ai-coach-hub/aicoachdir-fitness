import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PICKAXE_COMPLETIONS_URL = "https://api.pickaxe.co/v1/completions";
const PICKAXE_STUDIO_BASE_URL = "https://api.pickaxe.co/v1";
const GET_WORKOUT_PLAN_ACTION_ID = "ACTION7YYK7T0TVOGSV4AZIV45";

type MovementRule = {
  id: string;
  label: string;
  pattern: RegExp;
};

const LOWER_BODY_MOVEMENTS: MovementRule[] = [
  { id: "walking", label: "walking", pattern: /\b(?:walk|walking)\b/gi },
  { id: "cycling", label: "cycling", pattern: /\b(?:cycle|cycling|stationary bike|bicycl(?:e|ing))\b/gi },
  { id: "leg_press", label: "leg press", pattern: /\b(?:shallow[- ]range\s+)?leg press\b/gi },
  { id: "squat", label: "squat", pattern: /\b(?:bodyweight |box |goblet |front |back |split |supported |deep |shallow )?squats?\b/gi },
  { id: "lunge", label: "lunge", pattern: /\b(?:reverse |forward |walking |lateral |curtsy )?lunges?\b/gi },
  { id: "step_up", label: "step-up", pattern: /\bstep[- ]?ups?\b/gi },
  { id: "dead_bug", label: "dead bug", pattern: /\bdead bugs?\b/gi },
  { id: "bird_dog", label: "bird dog", pattern: /\bbird dogs?\b/gi },
  { id: "marching", label: "marching", pattern: /\b(?:march|marching)(?: in place)?\b/gi },
  { id: "leg_swing", label: "leg swing", pattern: /\bleg swings?\b/gi },
  { id: "hip_circle", label: "hip circle", pattern: /\bhip circles?\b/gi },
  { id: "quad_stretch", label: "quad stretch", pattern: /\b(?:standing )?(?:quad|quadriceps) stretch(?:es)?\b/gi },
  { id: "hamstring_stretch", label: "hamstring stretch", pattern: /\bhamstring stretch(?:es)?\b/gi },
  { id: "forward_fold", label: "forward fold", pattern: /\b(?:standing |seated )?forward folds?\b/gi },
  { id: "glute_bridge", label: "glute bridge", pattern: /\b(?:glute|hip) bridges?\b/gi },
  { id: "calf_raise", label: "calf raise", pattern: /\bcalf raises?\b/gi },
  { id: "wall_sit", label: "wall sit", pattern: /\bwall sits?\b/gi },
  { id: "hinge", label: "hip hinge", pattern: /\b(?:single[- ]leg )?(?:hip )?hinges?\b/gi },
  { id: "rdl", label: "Romanian deadlift", pattern: /\b(?:romanian deadlifts?|rdls?)\b/gi },
  { id: "deadlift", label: "deadlift", pattern: /\bdeadlifts?\b/gi },
  { id: "good_morning", label: "good morning", pattern: /\bgood mornings?\b/gi },
  { id: "kettlebell_swing", label: "kettlebell swing", pattern: /\bkettlebell swings?\b/gi },
  { id: "mountain_climber", label: "mountain climber", pattern: /\bmountain climbers?\b/gi },
  { id: "bear_crawl", label: "bear crawl", pattern: /\bbear crawls?\b/gi },
  { id: "high_knee", label: "high knees", pattern: /\bhigh knees?\b/gi },
  { id: "butt_kick", label: "butt kick", pattern: /\bbutt kicks?\b/gi },
  { id: "jumping_jack", label: "jumping jack", pattern: /\bjumping jacks?\b/gi },
  { id: "jump_rope", label: "jump rope", pattern: /\b(?:jump rope|rope jumping|skipping rope)\b/gi },
  { id: "burpee", label: "burpee", pattern: /\bburpees?\b/gi },
  { id: "inchworm", label: "inchworm", pattern: /\binchworms?(?: walkouts?)?\b/gi },
  { id: "hip_flexor_stretch", label: "hip-flexor stretch", pattern: /\bhip[- ]flexor stretch(?:es)?\b/gi },
  { id: "figure_four", label: "figure-4 stretch", pattern: /\bfigure[- ]?4(?: hip)? stretch(?:es)?\b/gi },
  { id: "clamshell", label: "clamshell", pattern: /\bclamshells?\b/gi },
  { id: "fire_hydrant", label: "fire hydrant", pattern: /\bfire hydrants?\b/gi },
  { id: "donkey_kick", label: "donkey kick", pattern: /\bdonkey kicks?\b/gi },
  { id: "lateral_band_walk", label: "lateral band walk", pattern: /\blateral band walks?\b/gi },
  { id: "monster_walk", label: "monster walk", pattern: /\bmonster walks?\b/gi },
  { id: "leg_extension", label: "leg extension", pattern: /\bleg extensions?\b/gi },
  { id: "leg_curl", label: "leg curl", pattern: /\bleg curls?\b/gi },
  { id: "running", label: "running/jogging", pattern: /\b(?:run|running|jog|jogging)\b/gi },
  { id: "elliptical", label: "elliptical", pattern: /\belliptical\b/gi },
  { id: "rowing_machine", label: "rowing machine", pattern: /\b(?:rowing machine|rower erg|rowing erg)\b/gi },
];

type Violation = {
  code: string;
  label: string;
  excerpt: string;
};

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isPreviewOnly() {
  const vercelEnv = (process.env.VERCEL_ENV || "").trim();
  return !vercelEnv || vercelEnv === "preview" || process.env.NODE_ENV === "development";
}

function getDeploymentKey() {
  return (
    process.env.PICKAXE_FITNESS_COACH_DEPLOYMENT_ID ||
    process.env.PICKAXE_FITNESS_COACH_DEPLOYMENT_TOKEN ||
    process.env.PICKAXE_FITNESS_DEPLOYMENT_TOKEN ||
    process.env.PICKAXE_DEPLOYMENT_API_KEY ||
    ""
  ).trim();
}

function getStudioToken() {
  return (process.env.PICKAXE_WORKSPACE_API_TOKEN || "").trim();
}

type ActionRun = {
  id?: string;
  sessionId?: string;
  content?: string;
  createdAt?: string;
};

function extractFinalDelivery(content: string) {
  const startMarker = "FINAL_DELIVERY_START";
  const endMarker = "FINAL_DELIVERY_END";
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);

  if (start < 0 || end < 0 || end <= start) return "";

  return content.slice(start + startMarker.length, end).trim();
}

async function fetchActionRunsForSession(sessionId: string, studioToken: string) {
  const url = new URL("/v1/studio/action/runs", "https://api.pickaxe.co");
  url.searchParams.set("actionId", GET_WORKOUT_PLAN_ACTION_ID);
  url.searchParams.set("sessionId", sessionId);
  url.searchParams.set("limit", "20");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${studioToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Action-run lookup failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as {
    data?: { runs?: ActionRun[] };
  };

  return Array.isArray(payload.data?.runs) ? payload.data.runs : [];
}

async function resolveValidatedFinalDelivery(sessionId: string, studioToken: string) {
  let runs: ActionRun[] = [];

  for (let attempt = 0; attempt < 6; attempt += 1) {
    runs = await fetchActionRunsForSession(sessionId, studioToken);

    const successes = runs
      .map((run) => ({
        run,
        finalDelivery: extractFinalDelivery(typeof run.content === "string" ? run.content : ""),
      }))
      .filter((item) => item.finalDelivery)
      .sort((a, b) => {
        const left = a.run.createdAt ? Date.parse(a.run.createdAt) : 0;
        const right = b.run.createdAt ? Date.parse(b.run.createdAt) : 0;
        return right - left;
      });

    if (successes.length > 0) {
      return {
        finalDelivery: successes[0].finalDelivery,
        runId: successes[0].run.id || null,
        runCount: runs.length,
      };
    }

    if (attempt < 5) {
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }

  return {
    finalDelivery: "",
    runId: null,
    runCount: runs.length,
  };
}

function getPositiveClause(message: string) {
  const pieces = message
    .split(/\bbut\b|[.!?]/i)
    .map((part) => part.trim())
    .filter(Boolean);

  const positive = pieces.find((part) =>
    /\b(?:comfortable|pain[- ]?free|feel(?:s)? fine|tolerat(?:e|ed|es)|okay|ok)\b/i.test(part),
  );

  return positive || "";
}

function collectAllowedMovementIds(message: string) {
  const positiveClause = getPositiveClause(message);
  if (!positiveClause) return new Set<string>();

  const allowed = new Set<string>();
  for (const rule of LOWER_BODY_MOVEMENTS) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(positiveClause)) allowed.add(rule.id);
  }
  return allowed;
}

function hasRestriction(message: string) {
  return /\b(?:pain|painful|irritat(?:e|es|ed|ing)|restriction|restricted|avoid|bother(?:s|ed)?|hurt(?:s|ing)?|aggravat(?:e|es|ed|ing)|can(?:not|'t))\b/i.test(
    message,
  );
}

function isNegated(text: string, start: number, end: number) {
  const before = text.slice(Math.max(0, start - 55), start).toLowerCase();
  const after = text.slice(end, Math.min(text.length, end + 45)).toLowerCase();

  const negationBefore =
    /(?:\bno\b|\bnot\b|\bavoid(?:ing)?\b|\bexclude(?:d|s|ing)?\b|\bwithout\b|\bskip(?:ping)?\b|\bnever\b|\bdo not\b|\bdon't\b|\bremove(?:d|s|ing)?\b|\bblock(?:ed|s|ing)?\b|\bprohibit(?:ed|s|ing)?\b)[^.!?\n]{0,35}$/i;

  const negationAfter =
    /^\s*(?:is|are|was|were|remain|remains)?\s*(?:excluded|avoided|not allowed|off[- ]limits|prohibited|blocked)/i;

  return negationBefore.test(before) || negationAfter.test(after);
}

function excerpt(text: string, start: number, end: number) {
  const left = Math.max(0, start - 55);
  const right = Math.min(text.length, end + 75);
  return text.slice(left, right).replace(/\s+/g, " ").trim();
}

function validateMovementAllowlist(message: string, responseText: string) {
  const violations: Violation[] = [];
  if (!hasRestriction(message)) return violations;

  const allowedIds = collectAllowedMovementIds(message);
  if (!allowedIds.size) return violations;

  for (const rule of LOWER_BODY_MOVEMENTS) {
    rule.pattern.lastIndex = 0;
    for (const match of responseText.matchAll(rule.pattern)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (allowedIds.has(rule.id) || isNegated(responseText, start, end)) continue;

      violations.push({
        code: "LOWER_BODY_ALLOWLIST",
        label: `${rule.label} is outside the user's explicit lower-body allowlist`,
        excerpt: excerpt(responseText, start, end),
      });
    }
  }

  return violations;
}

function validateInventedJointTargets(message: string, responseText: string) {
  const violations: Violation[] = [];
  if (!hasRestriction(message)) return violations;

  const userAlreadyProvidedAngle = /\b\d{1,3}\s*(?:°|degrees?|deg)\b/i.test(message);
  if (userAlreadyProvidedAngle) return violations;

  const anglePattern = /\b\d{1,3}\s*(?:°|degrees?|deg)\b/gi;
  for (const match of responseText.matchAll(anglePattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const context = responseText.slice(Math.max(0, start - 90), Math.min(responseText.length, end + 90));

    if (/\b(?:knee|hip|ankle|leg press|squat|lunge|step[- ]?up|depth|flexion|extension)\b/i.test(context)) {
      violations.push({
        code: "INVENTED_JOINT_TARGET",
        label: `invented lower-body joint/setup target: ${match[0]}`,
        excerpt: excerpt(responseText, start, end),
      });
    }
  }

  return violations;
}

function dedupeViolations(violations: Violation[]) {
  const seen = new Set<string>();
  return violations.filter((item) => {
    const key = `${item.code}|${item.label}|${item.excerpt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractResult(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const result = (payload as { result?: unknown }).result;
  if (typeof result === "string") return result;
  if (result == null) return "";
  return JSON.stringify(result, null, 2);
}

export async function POST(request: Request) {
  if (!isPreviewOnly()) {
    return Response.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  const expectedToken = (process.env.QA_WORKOUT_VALIDATOR_TOKEN || "").trim();
  const qaUserId = (process.env.QA_WORKOUT_VALIDATOR_USER_ID || "").trim();
  const suppliedToken = (request.headers.get("x-qa-validator-token") || "").trim();
  const deploymentKey = getDeploymentKey();
  const studioToken = getStudioToken();

  const requestOrigin = new URL(request.url).origin;
  const browserOrigin = (request.headers.get("origin") || "").trim();
  const fetchSite = (request.headers.get("sec-fetch-site") || "").trim().toLowerCase();
  const isSameOriginBrowserRequest =
    browserOrigin === requestOrigin && fetchSite === "same-origin";

  if (!qaUserId || !deploymentKey || !studioToken) {
    const missingConfiguration = [
      !qaUserId ? "QA_WORKOUT_VALIDATOR_USER_ID" : null,
      !deploymentKey
        ? "Pickaxe Fitness Coach deployment credential (PICKAXE_FITNESS_COACH_DEPLOYMENT_ID / PICKAXE_FITNESS_COACH_DEPLOYMENT_TOKEN / PICKAXE_FITNESS_DEPLOYMENT_TOKEN / PICKAXE_DEPLOYMENT_API_KEY)"
        : null,
      !studioToken ? "PICKAXE_WORKSPACE_API_TOKEN" : null,
    ].filter(Boolean);

    return Response.json(
      {
        ok: false,
        error: "Preview validator is not configured.",
        missingConfiguration,
      },
      { status: 503 },
    );
  }

  if (!isSameOriginBrowserRequest) {
    if (!expectedToken || !suppliedToken || !safeEqual(suppliedToken, expectedToken)) {
      return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const message =
    body && typeof body === "object" && typeof (body as { message?: unknown }).message === "string"
      ? (body as { message: string }).message.trim()
      : "";

  const requestedConversationId =
    body &&
    typeof body === "object" &&
    typeof (body as { conversationId?: unknown }).conversationId === "string"
      ? (body as { conversationId: string }).conversationId.trim()
      : "";

  if (!message || message.length > 12_000) {
    return Response.json({ ok: false, error: "Message is required and must be under 12,000 characters." }, { status: 400 });
  }

  const conversationId = /^qa-validator-[A-Za-z0-9_-]{8,120}$/.test(requestedConversationId)
    ? requestedConversationId
    : `qa-validator-${crypto.randomUUID()}`;

  let pickaxeResponse: Response;
  try {
    pickaxeResponse = await fetch(PICKAXE_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${deploymentKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        message,
        userId: qaUserId,
        conversationId,
        stream: false,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(115_000),
    });
  } catch {
    return Response.json({ ok: false, error: "Pickaxe request timed out or failed." }, { status: 502 });
  }

  const raw = await pickaxeResponse.text();
  let payload: unknown = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }

  if (!pickaxeResponse.ok) {
    return Response.json(
      {
        ok: false,
        error: "Pickaxe completion failed.",
        status: pickaxeResponse.status,
        detail:
          payload && typeof payload === "object"
            ? ((payload as { message?: unknown }).message ?? (payload as { error?: unknown }).error ?? null)
            : null,
      },
      { status: 502 },
    );
  }

  const responseText = extractResult(payload);
  if (!responseText) {
    return Response.json({ ok: false, error: "Pickaxe returned no response text." }, { status: 502 });
  }

  let relay;
  try {
    relay = await resolveValidatedFinalDelivery(conversationId, studioToken);
  } catch {
    return Response.json(
      {
        ok: false,
        error: "The validated Action result could not be retrieved for this exact conversation session.",
        conversationId,
      },
      { status: 502 },
    );
  }

  const actionRunsPresent = relay.runCount > 0;
  if (actionRunsPresent && !relay.finalDelivery) {
    return Response.json(
      {
        ok: false,
        blocked: true,
        error: "The coach invoked workout feasibility validation, but no successful FINAL_DELIVERY was available for this exact session.",
        conversationId,
        relaySource: "action-session-fail-closed",
        actionRunCount: relay.runCount,
      },
      { status: 422 },
    );
  }

  const finalResponseText = relay.finalDelivery || responseText;
  const relaySource = relay.finalDelivery ? "action-final-delivery" : "assistant-response";

  const violations = dedupeViolations([
    ...validateMovementAllowlist(message, finalResponseText),
    ...validateInventedJointTargets(message, finalResponseText),
  ]);

  if (violations.length) {
    console.warn("[qa-workout-validator] blocked", {
      conversationId,
      codes: violations.map((item) => item.code),
      labels: violations.map((item) => item.label),
    });

    return Response.json(
      {
        ok: false,
        blocked: true,
        conversationId,
        violations,
      },
      { status: 422 },
    );
  }

  return Response.json({
    ok: true,
    blocked: false,
    conversationId,
    response: finalResponseText,
    relaySource,
    actionRunCount: relay.runCount,
    actionRunId: relay.runId,
  });
}

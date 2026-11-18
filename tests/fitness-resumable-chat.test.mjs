import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const api = source("app/api/fitness/chat/route.ts");
const client = source("app/fitness/chat/page.tsx");
const jobs = source("lib/fitnessChatJobs.ts");
const migration = source("migrations/20261117_fitness_resumable_chat_REVIEW_ONLY.sql");

test("timezones are validated server-side and sent into saved-plan coaching", () => {
  assert.match(api, /function validIanaTimezone\(value: unknown\)/);
  assert.match(api, /new Intl.DateTimeFormat\("en-US", \{ timeZone: value\.trim\(\) \}\)/);
  assert.match(api, /const effectiveTimeZone = suppliedTimeZone \|\| validIanaTimezone\(planBeforeMutation\?\.userTimezone\) \|\| "UTC"/);
  assert.match(api, /userTimezone in all plan and Save Workout Plan action inputs/);
  assert.match(api, /buildSavedMutationMessage\(effectiveMessage, message, planBeforeMutation, effectiveTimeZone\)/);
  assert.match(client, /timeZone: Intl.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/);
});

test("new worker is off by default, production-only, and cannot bypass account verification", () => {
  assert.match(api, /process\.env\.VERCEL_ENV === "production"\s*&&\s*process\.env\.FITNESS_RESUMABLE_CHAT_ENABLED === "true"/);
  assert.match(api, /await memberHasFitnessAccess\(memberEmail, user\.id\)/);
  assert.match(jobs, /const PRODUCTION_NEON_BRANCH_ID = "br-sparkling-glitter-aucpz59d"/);
  assert.match(jobs, /process\.env\.FITNESS_RESUMABLE_CHAT_ENABLED !== "true"/);
  assert.match(jobs, /database branch mismatch/);
  assert.doesNotMatch(jobs, /CREATE TABLE/);
  assert.match(migration, /REVIEW\/APPLY BEFORE ENABLEMENT/);
});

test("a request gets one durable member-scoped claim and no automatic paid retry", () => {
  assert.match(jobs, /PRIMARY KEY \(member_email, request_key\)/.test(migration)
    ? /ON CONFLICT \(member_email, request_key\) DO NOTHING/
    : /never matches/);
  assert.match(jobs, /row\.request_hash !== args\.requestHash/);
  assert.match(jobs, /member_email=\$\{email\} AND request_key=\$\{requestKey\}/);
  assert.match(jobs, /AND state='queued'/);
  assert.match(api, /if \(claim\.created\) \{/);
  assert.match(api, /after\(async \(\) => \{/);
  assert.match(api, /if \(!\(await startFitnessChatJob\(memberEmail, requestKey\)\)\) return/);
  assert.match(api, /await runFitnessChatRequest\(workerRequest\)/);
  assert.doesNotMatch(jobs, /setInterval|fetch\(/);
});

test("result retrieval is read-only and bound to the authenticated member", () => {
  assert.match(api, /new URL\(request\.url\)\.searchParams\.get\("job"\)/);
  assert.match(api, /await getFitnessChatJob\(memberEmail, jobKey\)/);
  assert.match(client, /method: "GET", cache: "no-store"/);
  assert.match(client, /pollResumableFitnessJob\(requestKey\)/);
  assert.match(client, /sessionStorage\.setItem\(PENDING_FITNESS_JOB_KEY/);
  assert.match(client, /Only a request ID is stored, never the member's private message/);
  assert.match(jobs, /Never automatically replay a paid request/);
});

test("longer polling only applies inside the isolated background workout mutation", () => {
  assert.match(api, /const backgroundMutation = process\.env\.VERCEL_ENV === "production"/);
  assert.match(api, /backgroundMutation \? 230_000 : 100_000/);
  assert.match(api, /backgroundMutation \? 175_000 : 70_000/);
  assert.match(api, /backgroundMutation \? 190_000 : 55_000/);
  assert.match(api, /lateRelayWindowMs: backgroundMutation \? 35_000 : 4_000/);
  assert.match(api, /const uncertain = response\.status === 504/);
  assert.match(api, /state: "uncertain", httpStatus: 503/);
  assert.match(api, /savedPlanVerified: false/);
});

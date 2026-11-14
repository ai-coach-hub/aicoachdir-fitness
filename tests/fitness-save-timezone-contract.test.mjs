import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const paidClient = read("../app/fitness/chat/page.tsx");
const trialClient = read("../components/TrialChatClient.tsx");
const native = read("../app/api/fitness/chat/route.ts");
const publicTrial = read("../app/api/introductory-trial/chat/route.ts");

test("both Fitness chat clients forward the device timezone, without assuming Chicago for other members", () => {
  assert.match(paidClient, /timeZone:\s*Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/);
  assert.match(trialClient, /timeZone:\s*Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/);
  assert.doesNotMatch(paidClient, /timeZone:\s*["']America\/Chicago/);
});

test("Fitness saves use a valid plan/device IANA timezone and refuse provider generation when both are missing", () => {
  const routeStart = native.indexOf("async function postFitnessWithoutPreviewMeter(");
  const timezoneInput = native.indexOf("const requestedSaveTimezone = validWorkoutSaveTimezone(", routeStart);
  const actionRead = native.indexOf("readMemberWorkoutData(memberEmail, studioToken,", routeStart);
  const missingZoneGuard = native.indexOf("if (mustConfirmSavedPlanMutation && !saveTimeZone)", routeStart);
  const providerStart = native.indexOf("const mutationDriverPromise =", routeStart);
  assert.ok(routeStart >= 0 && timezoneInput > routeStart);
  assert.ok(actionRead > timezoneInput && missingZoneGuard > actionRead);
  assert.ok(providerStart > missingZoneGuard);
  assert.match(native, /validWorkoutSaveTimezone\(planBeforeMutation\?\.userTimezone\) \|\| requestedSaveTimezone/);
  assert.match(native, /resolvedOptions\(\)\.timeZone/);
  assert.match(native, /needsTimeZone: true/);
});

test("Pickaxe action instruction supplies timezone_name and plan.userTimezone rather than relying on a model guess", () => {
  assert.match(native, /timezone_name=\$\{JSON\.stringify\(saveTimeZone\)\}/);
  assert.match(native, /userTimezone=\$\{JSON\.stringify\(saveTimeZone\)\}/);
  assert.match(native, /buildSavedMutationMessage\(effectiveMessage, message, planBeforeMutation, saveTimeZone!\)/);
  assert.match(native, /const zone = String\(before\?\.userTimezone \|\| saveTimeZone\)/);
  assert.match(native, /savedPlanVerified: false/);
});

test("public Fitness trial propagates timezone and checks it before reserving messages", () => {
  const preflight = publicTrial.indexOf('if(coach==="fitness"){');
  const reservation = publicTrial.indexOf("reservePublicTrialTurn(account,coach,key)");
  assert.ok(preflight >= 0 && reservation > preflight);
  assert.match(publicTrial, /timeZone:memberTimeZone/);
  assert.match(publicTrial, /needsTimeZone:true/);
  assert.match(publicTrial, /No AI message was sent/);
});

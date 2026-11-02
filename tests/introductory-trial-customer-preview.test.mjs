import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const page=readFileSync(new URL("../app/introductory-preview/page.tsx",import.meta.url),"utf8");
const api=readFileSync(new URL("../app/api/isolated-introductory-trial/chat/route.ts",import.meta.url),"utf8");
test("trial UI selects all three coach names but uses one shared quota endpoint",()=>{
 assert.match(page,/fitness:"Fitness Coach",budgeting:"Budgeting Coach",life:"Life Coach"/);
 assert.match(page,/api\/isolated-introductory-trial\/chat/);
 assert.match(page,/15 messages shared across Fitness, Budgeting, and Life Coaching/);
 assert.doesNotMatch(page,/\/api\/fitness\/chat|\/api\/life\/chat|\/budget\/api\/chat/);
});
test("trial UI never exposes a free quota balance unless requested",()=>{
 assert.doesNotMatch(page,/Private AI uses left|remaining of|\{remaining\}/);
 assert.match(page,/introductory allowance has been used/);
});
test("trial API denies non-preview access before parsing request body or making provider requests",()=>{
 assert.ok(api.indexOf("if(!isolatedTrialPreviewEnabled())")<api.indexOf("request.json()"));
 assert.ok(api.indexOf("resolveIsolatedIntroductoryAccount()")<api.indexOf('fetch("https://api.pickaxe.co'));
});

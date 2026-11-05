import test from "node:test";import assert from "node:assert/strict";import {readFileSync} from "node:fs";
const s=readFileSync(new URL("../app/api/introductory-trial/budget-usage/route.ts",import.meta.url),"utf8");
test("Budgeting meter requires server signature and the actual active lifetime grant",()=>{
 assert.match(s,/publicTrialReleaseGate\(process\.env\)/);
 assert.match(s,/x-trial-usage-signature/);
 assert.match(s,/timingSafeEqual/);
 assert.match(s,/trial-budget-usage-v1/);
 assert.match(s,/grant\.length!==1/);
 assert.match(s,/paid\.length\|\|grant\[0\]\.converted_at!=null/);
 assert.match(s,/reservePublicTrialTurn\(account,"budgeting",v\.requestKey\)/);
});
test("saved Budgeting reply must be persisted at hub before one settled charge",()=>{
 assert.match(s,/storePublicTrialTurn\(account,"budgeting",v\.requestKey,v\.message,v\.reply\)/);
 assert.ok(s.indexOf("storePublicTrialTurn(account")<s.indexOf("settlePublicTrialTurn(account"));
 assert.match(s,/v\.reply\.trim\(\)/);
 assert.match(s,/status==="already_"\+outcome/);
});

test("retried Budgeting settlement only accepts the exact previously persisted message and response",()=>{
 assert.match(s,/h\.user_message=\$\{v\.message\}/);
 assert.match(s,/h\.coach_response=\$\{v\.reply\}/);
 assert.match(s,/r\.status IN \('reserved','completed'\)/);
 assert.match(s,/prior\.length!==1/);
});

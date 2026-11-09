import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const chat=read("../app/api/introductory-trial/chat/route.ts");
const history=read("../app/api/introductory-trial/history/route.ts");
const ledger=read("../lib/publicIntroductoryTrialLedger.ts");
test("released trial messages verify signed-in member and reserve before calling model",()=>{
 assert.match(chat,/isPublicTrialPreflightAvailable\(\)/);
 assert.match(chat,/assessVerifiedPublicTrialUser\(user\.id\)/);
 assert.match(chat,/admission\.kind!=="resume"/);
 assert.match(chat,/sharedUsageMemberKey/);
 assert.ok(chat.indexOf("reservePublicTrialTurn(account,coach,key)") < chat.indexOf('https://api.pickaxe.co/v1/completions'));
 assert.match(chat,/storePublicTrialTurn\(account,coach,key,message\.trim\(\),answer\)/);
 assert.match(chat,/settlePublicTrialTurn\(account,coach,key,outcome\)/);
 assert.match(chat,/outcome="uncertain"/);
 assert.match(chat,/outcome="released"/);
 assert.doesNotMatch(chat,/saveFitnessMembership\(|grantFitnessAccess\(|stripeRequest\(/);
});
test("history remains available after trial release switches are disabled, but only to same Clerk user",()=>{
 assert.match(history,/PUBLIC_INTRO_TRIAL_SCHEMA_READY/);
 assert.match(history,/clerk_user_id=\$\{user\.id\} AND member_key=\$\{memberKey\}/);
 assert.match(history,/readPublicTrialTurns\(user\.id,memberKey\)/);
 assert.match(history,/converted:/);
 assert.match(ledger,/productionTrialHistorySql\(\)/);
 assert.match(ledger,/WHERE g\.clerk_user_id=\$\{clerkId\} AND g\.member_key=\$\{member\}/);
 assert.doesNotMatch(history,/request\.json\(|searchParams|INSERT INTO|DELETE FROM/);
});

test("exhausted trial clearly redirects to paid membership while preserving prior conversations",()=>{
 assert.match(chat,/admission\.reason==="trial_exhausted"/);
 assert.match(chat,/introductory messages are complete/);
 assert.match(chat,/saved conversations, workouts and budgets remain available/);
 assert.match(chat,/,429\)/);
});

test("provider 404 is uncertain, never silently refunded or retried",()=>{
 assert.match(chat,/if\(model\.status===404\)throw Error\("Provider completion not independently verified"\)/);
 assert.doesNotMatch(chat,/if\(model\.status===404\)\{outcome="released"/);
 assert.match(chat,/catch\{[\s\S]*?outcome="uncertain";/);
 assert.match(chat,/settlePublicTrialTurn\(account,coach,key,outcome\)/);
});

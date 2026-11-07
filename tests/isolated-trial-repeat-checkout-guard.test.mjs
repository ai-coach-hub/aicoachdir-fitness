import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(path)=>readFileSync(new URL(path,import.meta.url),"utf8");
const identity=read("../lib/isolatedIntroductoryIdentity.ts");
const trial=read("../app/api/isolated-introductory-trial/route.ts");
const chat=read("../app/api/isolated-introductory-trial/chat/route.ts");
const checkout=read("../app/api/isolated-introductory-trial/checkout/route.ts");
const ledger=read("../lib/isolatedIntroductoryTrialDb.ts");
test("existing converted subscribers cannot acquire another private introductory trial",()=>{
 assert.match(identity,/if\(records\.length!==0\)return null/);
 assert.match(identity,/FROM public\.fitness_memberships WHERE email=/);
 assert.match(trial,/resolveIsolatedIntroductoryAccount\(\)/);
 assert.match(chat,/resolveIsolatedIntroductoryAccount\(\)/);
 assert.match(ledger,/ON CONFLICT DO NOTHING/);
});
test("private test checkout refuses converted accounts and cannot accept a user-selected live price",()=>{
 assert.match(checkout,/resolveIsolatedIntroductoryAccount\(\)/);
 assert.match(checkout,/grant\[0\]\.converted_at!==null/);
 assert.match(checkout,/await assertIsolatedTrialTestCheckout\(\)/);
 assert.doesNotMatch(checkout,/request\.json\(\)/);
 assert.match(checkout,/session\.livemode!==false/);
});

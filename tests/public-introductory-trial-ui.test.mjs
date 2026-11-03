import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const client=src("../components/TrialChatClient.tsx");
const chatPage=src("../app/introductory-trial/chat/page.tsx");
const histPage=src("../app/introductory-trial/history/page.tsx");
const home=src("../app/page.tsx");
test("the 15-message trial uses the same three coaches, accepts only explicit enrollment and keeps checkout optional",()=>{
 assert.match(client,/\["fitness","budgeting","life"\]/);
 assert.match(client,/\/api\/introductory-trial\/preflight/);
 assert.match(client,/\/api\/introductory-trial\/enroll/);
 assert.match(client,/\/api\/introductory-trial\/chat/);
 assert.match(client,/\/api\/introductory-trial\/history/);
 assert.match(client,/Explore Membership Options/);
 assert.match(client,/No credit card and no automatic charge/);
 assert.match(chatPage,/publicTrialReleaseGate\(process\.env\)/);
 assert.doesNotMatch(client,/checkout\.stripe\.com|Stripe\.redirectToCheckout/);
});
test("saved trial history remains Clerk-private after conversion",()=>{
 assert.match(histPage,/PUBLIC_INTRO_TRIAL_SCHEMA_READY/);
 assert.match(histPage,/clerk_user_id=\$\{user\.id\} AND member_key=\$\{member\}/);
 assert.match(histPage,/readPublicTrialTurns\(user\.id,member\)/);
 assert.match(histPage,/cleanLifeCoachText/);
});
test("free-trial marketing is never displayed unless every release gate passes",()=>{
 assert.match(home,/trialReleased=publicTrialReleaseGate\(process\.env\)/);
 assert.match(home,/trialReleased&&<Link href="\/introductory-trial"/);
 assert.doesNotMatch(home,/PUBLIC_INTRO_TRIAL_ENABLED==="true"/);
});

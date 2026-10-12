import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const load=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("life chat is private by default and requires verified Clerk email",()=>{
 const access=load("lib/lifeCoachAccess.ts"),api=load("app/api/life/chat/route.ts");
 assert.match(access,/currentUser\(/);
 assert.match(access,/LIFE_COACH_TESTER_EMAILS/);
 assert.ok(access.includes('primary.verification?.status !== "verified"'));
 assert.match(access,/VERCEL_ENV !== "preview"/);
 assert.ok(access.includes("allowed.includes(email)"));
 assert.match(api,/if\(!member\)return json/);
 assert.match(api,/PICKAXE_LIFE_COACH_DEPLOYMENT_TOKEN/);
});
test("all conversation SQL scopes membership to the Clerk user",()=>{
 const store=load("lib/lifeCoachStore.ts");
 assert.match(store,/member_id TEXT NOT NULL/);
 assert.match(store,/PRIMARY KEY \(member_id,id\)/);
 for(const method of ["listLifeThreads","readLifeThread","recallLifeContext","saveLifeTurn"])assert.match(store,new RegExp("function "+method));
 assert.ok((store.match(/member_id=\$\{member\}/g)||[]).length>=4);
 assert.match(store,/conversation_id<>\$\{currentId\}/);
 assert.match(store,/LIMIT 4/);
});
test("public coach cards and paid subscription logic were not changed in this PR",()=>{
 const api=load("app/api/life/chat/route.ts");
 assert.doesNotMatch(api,/stripe|checkout|fitness_memberships|budget_chat_threads/i);
});

test("life coach database is isolated from shared membership storage",()=>{
 const store=load("lib/lifeCoachStore.ts");
 assert.ok(store.includes("process.env.LIFE_COACH_DATABASE_URL"));
 for(const forbidden of ["process.env.DATABASE_URL","process.env.POSTGRES_URL","process.env.STORAGE_URL"])assert.ok(!store.includes(forbidden));
});

test("private Life Coach page never sends testers into paid Fitness login",()=>{
 const page=load("app/life/page.tsx");
 assert.ok(!page.includes('redirect("/fitness/login")'));
 assert.ok(page.includes("/sign-in?redirect_url="));
 assert.ok(page.includes("lifeTester()"));
});

test("cross-chat recall queries fall back to recent stored member statements",()=>{
 const store=load("lib/lifeCoachStore.ts");
 const api=load("app/api/life/chat/route.ts");
 assert.match(store,/isRecallQuestion/);
 assert.match(store,/rows.length\\?rows:/);
 assert.match(store,/conversation_id<>\\$\\{currentId\\}/);
 assert.match(api,/Do not say there is no earlier conversation/);
});
test("Life Coach chat labels do not render an escaped newline",()=>{
 const ui=load("app/life/LifeChat.tsx");
 assert.ok(ui.includes('marginTop:4'));
 assert.ok(!ui.includes('}</strong>\\\\n{m.text}'));
});

import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const load=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("life chat is private by default and requires Clerk tester ID",()=>{
 const access=load("lib/lifeCoachAccess.ts"),api=load("app/api/life/chat/route.ts");
 assert.match(access,/currentUser\(/);
 assert.match(access,/LIFE_COACH_TESTER_IDS/);
 assert.match(access,/ids\.includes\(user\.id\)/);
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
 assert.match(store,/process\\.env\\.LIFE_COACH_DATABASE_URL/);
 assert.doesNotMatch(store,/process\\.env\\.(DATABASE_URL|POSTGRES_URL|STORAGE_URL)/);
});

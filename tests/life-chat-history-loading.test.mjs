import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ui=readFileSync(new URL("../app/life/LifeChat.tsx",import.meta.url),"utf8");
test("Life Coach history distinguishes loading, empty success and failed reads",()=>{
 assert.match(ui,/historyState==="loading"/);
 assert.match(ui,/historyState==="error"/);
 assert.match(ui,/historyState==="ready"&&threads\.length===0/);
 assert.match(ui,/Previous chats couldn't be loaded/);
 assert.match(ui,/They have not been deleted/);
 assert.match(ui,/Retry loading chats/);
});
test("history errors do not overwrite existing saved conversation list",()=>{
 assert.match(ui,/if\(!r\.ok\)throw Error\("History unavailable"\)/);
 assert.match(ui,/!j\.ok\|\|!Array\.isArray\(j\.threads\)/);
 assert.match(ui,/setThreads\(j\.threads\);setHistoryState\("ready"\)/);
 assert.match(ui,/catch\{setHistoryState\("error"\);\}/);
});

// Free usage questions are real saved conversation turns, but never reserve credits.
test("Life Coach usage replies are saved after ownership and replay checks",()=>{
 const route=readFileSync(new URL("../app/api/life/chat/route.ts",import.meta.url),"utf8");
 const recovery=route.indexOf("if(newConversationId) {");
 const ownership=route.indexOf("if(supplied) {");
 const usage=route.indexOf("Usage questions are answered from the authenticated ledger");
 const persist=route.indexOf("await saveLifeTurn(member,id,message,response);",usage);
 const model=route.indexOf("reserveSharedUsage(email,\"life\",requestKey)");
 assert.ok(recovery>0 && ownership>recovery && usage>ownership && persist>usage && model>persist);
 assert.match(route.slice(usage,model),/source:"member-usage"/);
 assert.doesNotMatch(route.slice(usage,model),/reserveSharedUsage\(/);
});

test("My Goals retrieves only member-owned explicit goals without an AI request",()=>{
 const store=readFileSync(new URL("../lib/lifeCoachStore.ts",import.meta.url),"utf8");
 const api=readFileSync(new URL("../app/api/life/chat/route.ts",import.meta.url),"utf8");
 const ui=readFileSync(new URL("../app/life/LifeChat.tsx",import.meta.url),"utf8");
 assert.match(store,/export async function listLifeGoals\(member: string\)/);
 assert.match(store,/WHERE member_id=\$\{member\} AND role='user'/);
 const readRoute=api.slice(api.indexOf("export async function GET"),api.indexOf("export async function POST"));
 assert.match(readRoute,/params.get\("goals"\)==="1"/);
 assert.match(readRoute,/listLifeGoals\(member\)/);
 assert.doesNotMatch(readRoute,/reserveSharedUsage|completeLifeCoachRequest/);
 assert.match(ui,/fetch\("\/api\/life\/chat\?goals=1"/);
 assert.match(ui,/My Goals/);
});

test("Life Coach internal goal list can still open and draft a coaching request without sending",()=>{
 const page=readFileSync(new URL("../app/life/page.tsx",import.meta.url),"utf8");
 const dashboard=readFileSync(new URL("../app/dashboard/page.tsx",import.meta.url),"utf8");
 assert.match(dashboard,/href="\/life">Open Life Coach/);
 assert.doesNotMatch(dashboard,/href="\/life\?goals=1"|My Goals/);
 assert.match(page,/initialGoals=\{initialGoals\}/);
 assert.match(ui,/initialGoalsOpened\.current=true;void openGoals\(\)/);
 assert.match(ui,/Continue with Life Coach/);
 assert.match(ui,/setInput\("Help me take a practical next step toward this goal: "\+g\.text\)/);
 assert.doesNotMatch(ui,/onClick=\{\(\)=>\{[^}]*send\(/);
});

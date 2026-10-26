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

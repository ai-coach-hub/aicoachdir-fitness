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

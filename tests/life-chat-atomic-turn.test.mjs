import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const store=readFileSync(new URL("../lib/lifeCoachStore.ts",import.meta.url),"utf8");
test("a complete chat turn is inserted in one atomic SQL statement",()=>{
 const start=store.indexOf("export async function saveLifeTurn(");
 assert.ok(start>0);
 const source=store.slice(start);
 assert.match(source,/WITH thread AS \(/);
 assert.match(source,/INSERT INTO life_chat_threads/);
 assert.match(source,/INSERT INTO life_chat_messages/);
 assert.match(source,/CROSS JOIN \(VALUES/);
 assert.match(source,/\('user',/);
 assert.match(source,/\('assistant',/);
 assert.equal((source.match(/await sql`/g)||[]).length,1);
});
test("turn writes remain member scoped and preserve bounded input",()=>{
 const body=store.slice(store.indexOf("export async function saveLifeTurn("));
 assert.match(body,/\$\{member\}/);
 assert.match(body,/\$\{id\}/);
 assert.match(body,/question\.slice\(0,6000\)/);
 assert.match(body,/answer\.slice\(0,10000\)/);
});

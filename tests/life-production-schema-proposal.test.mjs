import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../migrations/20261022_life_chat_private_to_production.sql",import.meta.url),"utf8");
test("Life schema migration preserves member-bound thread ownership",()=>{
 assert.match(sql,/PRIMARY KEY \(member_id,id\)/);
 assert.match(sql,/FOREIGN KEY \(member_id,conversation_id\)/);
 assert.match(sql,/REFERENCES public\.life_chat_threads\(member_id,id\)/);
 assert.match(sql,/life_chat_messages_member_thread_idx/);
 assert.match(sql,/life_chat_threads_member_updated_idx/);
});
test("migration doesn't touch membership, Stripe, preview usage or production auth",()=>{
 const statements=sql.split("\n").filter(line=>!line.trim().startsWith("--") && !/ON DELETE CASCADE/i.test(line)).join("\n");
 assert.doesNotMatch(statements,/\b(?:DROP|TRUNCATE|DELETE|UPDATE|GRANT|REVOKE)\b/i);
 assert.doesNotMatch(sql,/\b(?:stripe|subscriptions|preview_ai_usage)\b/i);
 assert.match(sql,/BEGIN;/);
 assert.match(sql,/COMMIT;/);
});

import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const src=await readFile(new URL("../migrations/20261028_upgrade_intents_and_atomic_apply.sql",import.meta.url),"utf8");
test("one pending intent per subscription prevents competing charged upgrades",()=>{
 assert.match(src,/CREATE UNIQUE INDEX IF NOT EXISTS shared_ai_one_open_upgrade_per_subscription/);
 assert.match(src,/WHERE status IN \('prepared','submitted'\)/);
});
test("paid-invoice application atomically preserves all existing usage",()=>{
 assert.match(src,/FOR UPDATE/);
 assert.match(src,/UPDATE public\.shared_ai_usage_periods SET limit_uses=v_intent\.target_limit/);
 assert.doesNotMatch(src,/SET completed_uses\s*=/);
 assert.doesNotMatch(src,/SET reserved_uses\s*=/);
 assert.match(src,/already_applied/);
 assert.match(src,/invoice_mismatch/);
 assert.match(src,/REVOKE ALL ON FUNCTION public\.shared_ai_apply_paid_upgrade\(uuid,text\) FROM PUBLIC/);
});

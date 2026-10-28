import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const sql=await readFile(new URL("../migrations/20261027_shared_wallet_upgrade_draft.sql",import.meta.url),"utf8");
test("same-period wallet migration updates only cap, never consumed or reserved values",()=>{
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/v\.limit_uses<>p_expected_limit/);
 assert.match(sql,/SET limit_uses=p_target_limit/);
 assert.doesNotMatch(sql,/SET\s+completed_uses\s*=/);
 assert.doesNotMatch(sql,/SET\s+reserved_uses\s*=/);
});
test("wallet increase is not customer-callable and fails stale or replayed changes",()=>{
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.shared_ai_upgrade_allowance[^\n]+FROM PUBLIC/);
 assert.match(sql,/stale_or_already_changed/);
 assert.match(sql,/p_target_limit<=p_expected_limit/);
});

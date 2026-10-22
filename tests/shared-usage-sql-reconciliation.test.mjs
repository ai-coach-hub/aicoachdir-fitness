import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../migrations/20261022_shared_ai_usage.sql",import.meta.url),"utf8");
const life=readFileSync(new URL("../migrations/20261022_life_chat_private_to_production.sql",import.meta.url),"utf8");

test("shared wallet migration adds only its isolated tables and SQL functions",()=>{
 assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.shared_ai_usage_periods/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.shared_ai_usage_requests/);
 assert.doesNotMatch(sql,/\bDROP\s+(TABLE|SCHEMA|DATABASE|FUNCTION)\b|\bTRUNCATE\b|DELETE FROM fitness_memberships|UPDATE fitness_memberships/i);
 assert.doesNotMatch(life,/\bDROP\s+(TABLE|SCHEMA|DATABASE|FUNCTION)\b|\bTRUNCATE\b/i);
});
test("uncertain model results can be reconciled later by a separate reviewed SQL operation",()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.shared_ai_reconcile\(/);
 const reconciler=sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.shared_ai_reconcile("));
 assert.match(reconciler,/p_actual NOT IN \('completed','released'\)/);
 assert.match(reconciler,/FROM public\.shared_ai_usage_periods[\s\S]*FOR UPDATE/);
 assert.match(reconciler,/FROM public\.shared_ai_usage_requests[\s\S]*FOR UPDATE/);
 assert.match(reconciler,/v_status\s*<>\s*'uncertain'/);
 assert.match(reconciler,/reserved_uses\s*=\s*reserved_uses\s*-\s*1/);
 assert.match(reconciler,/completed_uses\s*=\s*completed_uses\s*\+/);
 assert.match(reconciler,/AND request_key\s*=\s*p_request/);
 for(const name of ["reserve","settle","reconcile"]) {
  assert.match(sql,new RegExp("REVOKE ALL ON FUNCTION public\\\\.shared_ai_"+name+"\\\\("));
 }

});
test("reconciliation is not callable from any member-facing request route",()=>{
 const hub=readFileSync(new URL("../app/api/internal/shared-usage/route.ts",import.meta.url),"utf8");
 const life=readFileSync(new URL("../app/api/life/chat/route.ts",import.meta.url),"utf8");
 const fitness=readFileSync(new URL("../app/api/fitness/chat/route.ts",import.meta.url),"utf8");
 for(const route of [hub,life,fitness]) assert.doesNotMatch(route,/shared_ai_reconcile|reconcileSharedUsage/);
});

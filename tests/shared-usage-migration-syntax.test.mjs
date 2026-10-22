import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../migrations/20261022_shared_ai_usage.sql",import.meta.url),"utf8");
test("shared wallet migration contains three fully dollar-quoted functions",()=>{
 const names=["shared_ai_reserve","shared_ai_settle","shared_ai_reconcile"];
 const sections=sql.split(/CREATE OR REPLACE FUNCTION public\./).slice(1);
 assert.equal(sections.length,names.length);
 for(const [index,name] of names.entries()){
  const definition=sections[index];
  assert.ok(definition.startsWith(name+"("), "Wrong function "+name);
  const open=definition.match(/\bAS\s+(\$[A-Za-z0-9_]*\$)\s*\n/);
  assert.ok(open, name+" must open a complete dollar-quote delimiter");
  const delimiter=open[1];
  const close=definition.indexOf("END "+delimiter+";");
  assert.ok(close>0,name+" must close the matching delimiter");
  assert.ok(definition.indexOf("DECLARE")>0 && definition.indexOf("BEGIN")>0);
 }
});
test("no shared wallet function is executable by the PUBLIC role",()=>{
 for(const signature of [
  "shared_ai_reserve(text,text,timestamptz,timestamptz,integer,text,text)",
  "shared_ai_settle(text,text,timestamptz,text,text)",
  "shared_ai_reconcile(text,text,timestamptz,text,text)"
 ])assert.ok(sql.includes("REVOKE ALL ON FUNCTION public."+signature+" FROM PUBLIC;"),signature);
});
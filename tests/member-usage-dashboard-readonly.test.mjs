import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const source=read("lib/memberUsageDisplay.ts");
test("invalid usage counts fail closed, including duplicate reservations and impossible totals",()=>{
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};
 runInNewContext(js,{module:m,exports:m.exports,require:()=>({})});
 const calculate=m.exports.validatedUsageCounts;
 assert.equal(calculate({completed_uses:1,reserved_uses:1},10).remaining,8);
 assert.equal(calculate({completed_uses:11,reserved_uses:0},10),null);
 assert.equal(calculate({completed_uses:-1,reserved_uses:0},10),null);
 assert.equal(calculate({completed_uses:1.5,reserved_uses:0},10),null);
 assert.equal(calculate({completed_uses:0,reserved_uses:0},400).remaining,400);
});
test("member UI distinguishes temporary Life benefit and verified shared wallet",()=>{
 const page=read("app/dashboard/page.tsx");
 assert.match(page,/await memberUsageDisplay\(email\)/);
 assert.match(page,/usage\.kind==="launch"/);
 assert.match(page,/usage\.kind==="shared"/);
 assert.match(page,/current-cycle total is not yet available/);
 assert.match(source,/resolvedCurrentSharedUsage|resolveCurrentSharedUsage\(email\)/);
 assert.match(source,/verifiedLifeLaunchPermit\(email\)/);
 assert.doesNotMatch(source,/INSERT INTO|UPDATE public|shared_ai_reserve|life_launch_reserve/);
});

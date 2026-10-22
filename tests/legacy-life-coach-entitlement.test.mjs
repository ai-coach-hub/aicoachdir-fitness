import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const src=readFileSync(new URL("../lib/legacyLifeCoachEntitlement.ts",import.meta.url),"utf8");
const js=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const mod={exports:{}};
runInNewContext(js,{module:mod,exports:mod.exports,Object},{timeout:3000});
const {approvedLegacyLifeEntitlement}=mod.exports;
test("existing members get Life Coach in SAME 400 shared uses, no reset",()=>{
 const e=approvedLegacyLifeEntitlement();
 assert.equal(e.includedUses,400);
 assert.equal(e.allowanceLedgerKey,"approved_fitness_v2_legacy");
 assert.deepEqual([...e.allowedCoaches],["fitness","budgeting","life"]);
 assert.equal(e.allowedCoaches.includes("career"),false);
 assert.equal(Object.isFrozen(e.allowedCoaches),true);
});
test("entitlement mapping has no Stripe, provider or database side effects",()=>{
 assert.doesNotMatch(src,/\bfetch\s*\(|\bneon\s*\(|stripeRequest\s*\(|grantFitnessAccess\s*\(/);
});

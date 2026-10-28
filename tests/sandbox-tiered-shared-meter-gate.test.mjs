import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";

const raw=readFileSync(new URL("../lib/sharedUsageMeter.ts",import.meta.url),"utf8");
const code=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const upgradeBranch="feature/verified-subscription-upgrade-policy-20261027";
function gate(env){
 const mod={exports:{}};
 runInNewContext(code,{module:mod,exports:mod.exports,process:{env},Date,require:()=>({})},{timeout:3000});
 return mod.exports.sharedUsageGateEnabled();
}
test("isolated sandbox uses its own opt-in gate without inheriting production shared-usage switch",()=>{
 assert.equal(gate({VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:upgradeBranch,UPGRADE_SANDBOX_SHARED_METER_ENABLED:"true"}),true);
 assert.equal(gate({VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:upgradeBranch,UPGRADE_SANDBOX_SHARED_METER_ENABLED:"false",SHARED_USAGE_GATE_ENABLED:"true"}),false);
 assert.equal(gate({VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:upgradeBranch}),false);
});
test("the upgrade switch can never authorize usage in other preview branches or production",()=>{
 assert.equal(gate({VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"other",UPGRADE_SANDBOX_SHARED_METER_ENABLED:"true"}),false);
 assert.equal(gate({VERCEL_ENV:"production",VERCEL_GIT_COMMIT_REF:upgradeBranch,UPGRADE_SANDBOX_SHARED_METER_ENABLED:"true"}),false);
});

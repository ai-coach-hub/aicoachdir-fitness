import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";
import {createHmac,timingSafeEqual} from "node:crypto";
const raw=readFileSync(new URL("../lib/privateBudgetUsageProtocol.ts",import.meta.url),"utf8");
const js=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
runInNewContext(js,{module:mod,exports:mod.exports,
 require:n=>{assert.equal(n,"node:crypto");return {createHmac,timingSafeEqual};},
 Buffer},{timeout:3000});
const {signBudgetSharedCall:sign,verifyBudgetSharedCall:verify}=mod.exports;
const secret="s".repeat(48);
const now=1792688400;
const call={action:"reserve",email:"member@example.test",
 requestKey:"private-test-abcdef123",issuedAt:now};
test("signed Budgeting reserve validates only a fresh canonical request",()=>{
 const signature=sign(call,secret);
 assert.equal(verify(call,signature,secret,now),true);
 assert.equal(verify(call,signature,secret,now+91),false);
 assert.equal(verify(call,signature,secret,"short",now),false);
 assert.equal(verify({...call,email:"another@example.test"},signature,secret,now),false);
 assert.equal(verify({...call,requestKey:"other-request-12345"},signature,secret,now),false);
 assert.equal(verify({...call,issuedAt:now+900},signature,secret,now),false);
});
test("settlement cannot be fabricated or altered from a reservation signature",()=>{
 const settled={...call,action:"settle",outcome:"completed"};
 assert.equal(verify(settled,sign(settled,secret),secret,now),true);
 assert.equal(verify({...settled,outcome:"released"},sign(settled,secret),secret,now),false);
 assert.equal(verify({...call,outcome:"completed"},sign({...call,outcome:"completed"},secret),secret,now),false);
 assert.equal(verify({...call,action:"settle"},sign({...call,action:"settle"},secret),secret,now),false);
});
test("private signature contract contains no provider, billing or storage calls",()=>{
 assert.doesNotMatch(raw,/\bfetch\(|\bneon\(|stripeRequest\(|api\.pickaxe/);
});

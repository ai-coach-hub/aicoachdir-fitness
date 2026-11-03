import test from "node:test";
import assert from "node:assert/strict";
import {STRESS_TEST_CANDIDATES,COST_SAFETY_DRAFT,evaluateStressTest} from "../lib/membershipStressTestDraft.mjs";
test("four candidate plans exceed 30 percent contribution margin at modeled full use",()=>{
 const results=evaluateStressTest();
 assert.equal(results.length,4);
 assert.deepEqual(results.map(x=>x.passes),[true,true,true,true]);
 assert.deepEqual(results.map(x=>Number(x.margin.toFixed(3))),[0.382,0.351,0.359,0.374]);
});
test("a cost increase to $0.14 fails closed for all plans",()=>{
 const results=evaluateStressTest(STRESS_TEST_CANDIDATES,{...COST_SAFETY_DRAFT,unitCostUsd:0.14});
 assert.deepEqual(results.map(x=>x.passes),[false,false,false,false]);
});
test("invalid candidate sets never become launch recommendations",()=>{
 assert.equal(evaluateStressTest(STRESS_TEST_CANDIDATES.slice(0,3)),null);
});

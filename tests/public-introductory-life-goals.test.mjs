import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import {readFileSync} from "node:fs";
const filename=new URL("../lib/publicIntroductoryLifeGoals.ts",import.meta.url);
const source=readFileSync(filename,"utf8");
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
const compile=new Function("require","module","exports",js);
const fakeRequire=(name)=>{
 if(name==="node:crypto")return {createHash:()=>({update(){return this},digest(){return "a".repeat(64)}})};
 if(name.includes("lifeCoachStore"))return {saveLifeTurn:async()=>{},readLifeThread:async()=>null};
 throw Error("Unexpected imported dependency");
};
compile(fakeRequire,mod,mod.exports);
const {explicitLifeGoalRequest:isGoal}=mod.exports;
test("native Life goal recognition only saves explicit goals, never advice questions",()=>{
 assert.equal(isGoal("My goal is to read every night. Please remember this goal."),true);
 assert.equal(isGoal("Give me one simple goal for tomorrow"),false);
 assert.equal(isGoal("How do I build a bedtime routine?"),false);
 assert.equal(isGoal("Please remember I am suicidal. My goal is to hurt myself"),false);
});
test("goal persistence uses the same native Life store and confirms readback, no AI cost",()=>{
 assert.match(source,/saveLifeTurn\(memberClerkId,conversationId,message,response\)/);
 assert.match(source,/readLifeThread\(memberClerkId,conversationId\)/);
 assert.match(source,/readback\?\.length!==2/);
 assert.doesNotMatch(source,/stripeRequest\(|reserveSharedUsage\(|intro_trial_reserve\(|fetch\(/);
});

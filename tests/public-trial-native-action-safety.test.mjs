import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import {readFileSync} from "node:fs";
const file=new URL("../lib/publicTrialNativeActionSafety.ts",import.meta.url);
const js=ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const mod={exports:{}};new Function("module","exports",js)(mod,mod.exports);
const {nativeTrialWriteRequested:write,nativeTrialWriteExplanation:explain}=mod.exports;
test("declines Fitness native workout changes while still allowing workout advice",()=>{
 for(const text of ["Please save my workout plan","Modify this workout","Mark my workout complete","Update my schedule"])
  assert.equal(write("fitness",text),true,text);
 for(const text of ["How do I modify my plan?","Suggest a 20 minute bodyweight workout","Which stretches are good for mobility?"])
  assert.equal(write("fitness",text),false,text);
});
test("declines Budgeting native expense and rollover mutations, but allows planning questions",()=>{
 for(const text of ["Add $25 groceries","Please update my budget","Record a $16 expense","Copy my budget from October","Roll over my remaining budget"])
  assert.equal(write("budgeting",text),true,text);
 for(const text of ["How can I save $500?","Explain what rollover adjustment means","What's the 50/30/20 rule?"])
  assert.equal(write("budgeting",text),false,text);
});
test("declines Life goal persistence without implying goals were remembered",()=>{
 for(const text of ["Remember my goal to exercise","Save my goal for tomorrow","Please remember this goal"])
  assert.equal(write("life",text),true,text);
 for(const text of ["Give me one simple goal for tomorrow","How do I stick to my habits?"])
  assert.equal(write("life",text),false,text);
});
test("unconnected Life memory variants do not silently imply saved changes or charge a message",()=>{
 for(const text of [
  "Please save my morning routine",
  "Remember my daily routine",
  "Add reading to my goals",
  "Put stretching into my habits",
  "Make a note of my goal to walk",
  "Keep track of my weekly commitments",
  "Write down my new routine"
 ])assert.equal(write("life",text),true,text);
 for(const text of [
  "How can I build a morning routine?",
  "Suggest a bedtime habit",
  "What would make a good weekly goal?",
  "Give me one simple goal for tomorrow"
 ])assert.equal(write("life",text),false,text);
});
test("blocked native operations explain no action was saved and no usage consumed",()=>{
 for(const coach of ["fitness","budgeting","life"]){
  assert.match(explain(coach),/No changes were saved/);
  assert.match(explain(coach),/no trial message was used/);
 }
 const chat=readFileSync(new URL("../app/api/introductory-trial/chat/route.ts",import.meta.url),"utf8");
 assert.match(chat,/nativeTrialWriteRequested\(coach,message\)/);
 assert.ok(chat.indexOf("nativeTrialWriteRequested(coach,message)")<chat.indexOf("reservePublicTrialTurn(account,coach,key)"));
});

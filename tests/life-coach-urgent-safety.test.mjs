import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const src=readFileSync(new URL("../lib/lifeCoachSafetyFallback.ts",import.meta.url),"utf8");
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
runInNewContext(js,{module:mod,exports:mod.exports},{timeout:3000});
const {urgentLifeCoachReply}=mod.exports;
test("urgent distress immediately receives human crisis resources and a safety check",()=>{
 for(const phrase of ["I'm thinking about suicide","I want to kill myself","I might hurt myself tonight","I took an overdose","I don't want to live"]){
  const response=urgentLifeCoachReply(phrase);
  assert.equal(typeof response,"string",phrase);
  assert.match(response,/emergency services/);
  assert.match(response,/988/);
  assert.match(response,/Are you safe right now\?/);
 }
});
test("ordinary coaching requests are not diverted or billed by safety fallback",()=>{
 for(const phrase of ["My goal is to read 5 minutes a day","I am having trouble planning my time","I want to improve my work life balance"]){
  assert.equal(urgentLifeCoachReply(phrase),null);
 }
});
test("private route places zero-model safety response before paid model gate",()=>{
 const route=readFileSync(new URL("../app/api/life/chat/route.ts",import.meta.url),"utf8");
 assert.ok(route.indexOf("urgentLifeCoachReply(message)")>0);
 assert.ok(route.indexOf("urgentLifeCoachReply(message)")<route.indexOf("PICKAXE_LIFE_COACH_DEPLOYMENT_TOKEN"));
 assert.match(route,/source:"safety"/);
});

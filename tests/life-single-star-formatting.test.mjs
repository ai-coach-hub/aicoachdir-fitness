import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
import {runInNewContext} from "node:vm";
const source=readFileSync(new URL("../lib/lifeCoachFormatting.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
runInNewContext(compiled,{module,exports:module.exports});
const clean=module.exports.cleanLifeCoachText;
test("single and double star emphasis render as ordinary text",()=>{
 assert.equal(clean("*to the kids*"),"to the kids");
 assert.equal(clean("Say *to the kids* gently."),"Say to the kids gently.");
 assert.equal(clean("**Important:** Keep it practical."),"Important: Keep it practical.");
 assert.equal(clean("A *helpful* idea and a **clear** plan"),"A helpful idea and a clear plan");
});
test("do not alter legitimate literal star symbols",()=>{
 assert.equal(clean("5 * 3 = 15"),"5 * 3 = 15");
 assert.equal(clean("A * B * C"),"A * B * C");
});

import test from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {readFileSync} from "node:fs";
import ts from "typescript";
import {runInNewContext} from "node:vm";
const src=readFileSync(new URL("../lib/sharedUsageMemberIdentity.ts",import.meta.url),"utf8");
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
runInNewContext(js,{module,exports:module.exports,require:id=>{
 assert.equal(id,"node:crypto");return {createHmac};
}},{timeout:3000});
const {sharedUsageMemberKey:memberKey}=module.exports;
test("same verified email produces stable cross-app opaque identity",()=>{
 const secret="shared-qa-secret-material-longer-than-32-characters";
 const key=memberKey("Example.Person@example.com",secret);
 assert.match(key,/^member_[0-9a-f]{64}$/);
 assert.equal(key,memberKey("example.person@EXAMPLE.COM",secret));
 assert.ok(!key.includes("example.com"));
 const match="member_"+createHmac("sha256",secret)
  .update("aicoachdir-shared-v1\nexample.person@example.com").digest("hex");
 assert.equal(key,match);
});
test("invalid email or missing secret never grants an identity",()=>{
 assert.equal(memberKey("bad-address","a".repeat(40)),"");
 assert.equal(memberKey("a@example.com","tiny"),"");
 assert.notEqual(memberKey("a@example.com","x".repeat(40)),
  memberKey("b@example.com","x".repeat(40)));
});

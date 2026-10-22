import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../app/api/life/privacy-check/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

function fixture({ actualBranch = "br-autumn-breeze-auw38rgr", env = {}, leaked = false, emptyOwn = false } = {}) {
  let member = "user_internal_test_a";
  const audit = new Set();
  const queries = [];
  const sql = async (parts,...args) => {
    const q = parts.join(" ? ");
    queries.push(q);
    if (q.includes("current_setting('neon.branch_id'")) return [{branch_id:actualBranch}];
    if (q.includes("SELECT foreign_threads.id"))
      return [{id:"life-coach-other-member-thread-12345678"}];
    if (q.includes("CREATE TABLE IF NOT EXISTS life_privacy_test_checks"))return [];
    if (q.includes("INSERT INTO life_privacy_test_checks")) {
      audit.add(args[0]); return [];
    }
    if (q.includes("SELECT COUNT(*)::integer AS verified_accounts"))
      return [{verified_accounts:audit.size}];
    throw Error("Unexpected private privacy-check SQL: "+q);
  };
  const envValues = {
    VERCEL_ENV:"preview",
    VERCEL_GIT_COMMIT_REF:"feature/life-coach-agent-sandbox-20261011",
    LIFE_COACH_DATABASE_URL:"postgresql://private.invalid/test",
    ...env,
  };
  const mod = { exports: {} };
  runInNewContext(compiled, {
    module:mod,exports:mod.exports,Response,Request,URL,
    process:{env:envValues},
    require(name) {
      if (name === "@neondatabase/serverless")
        return {neon(url){assert.equal(url,envValues.LIFE_COACH_DATABASE_URL);return sql;}};
      if (name === "@/lib/lifeCoachAccess")
        return {lifeTester:async()=>member};
      if (name === "@/lib/lifeCoachStore")
        return {
          listLifeThreads:async owner=>emptyOwn?[]:[{id:"life-coach-own-"+owner,title:"Test",updatedAt:"today"}],
          readLifeThread:async()=>leaked?[{role:"user",text:"foreign",createdAt:"today"}]:null
        };
      throw Error("Unexpected module "+name);
    }
  },{timeout:3000});
  const request = (origin="https://preview.example.test") =>
    new Request("https://preview.example.test/api/life/privacy-check",{
      method:"POST",headers:{origin}
    });
  return {
    route:mod.exports,
    setMember:value=>member=value,
    queries,audit,request,
  };
}

test("private verification is locked to the sandbox, verified auth and same origin",async()=>{
  const production=fixture({env:{VERCEL_ENV:"production"}});
  assert.equal((await production.route.POST(production.request())).status,404);
  assert.equal(production.queries.length,0);
  const otherBranch=fixture({env:{VERCEL_GIT_COMMIT_REF:"main"}});
  assert.equal((await otherBranch.route.POST(otherBranch.request())).status,404);
  const signedOut=fixture();
  signedOut.setMember(null);
  assert.equal((await signedOut.route.POST(signedOut.request())).status,403);
  assert.equal((await signedOut.route.POST(signedOut.request("https://malicious.test"))).status,403);
  assert.equal(signedOut.queries.length,0);
});

test("wrong Neon branch prevents all read/write privacy checks",async()=>{
  const x=fixture({actualBranch:"br-wrong"});
  const res=await x.route.POST(x.request());
  assert.equal(res.status,503);
  assert.equal(x.queries.length,1);
  assert.equal(x.audit.size,0);
});

test("one signed-in test account cannot self-certify two sessions",async()=>{
  const x=fixture();
  const first=await (await x.route.POST(x.request())).json();
  assert.equal(first.ok,true);
  assert.equal(first.passed,true);
  assert.equal(first.twoAccountCheckComplete,false);
  assert.equal(first.completedSessions,1);
  const repeated=await (await x.route.POST(x.request())).json();
  assert.equal(repeated.twoAccountCheckComplete,false);
  assert.equal(x.audit.size,1);
  assert.equal(JSON.stringify(first).includes("user_internal_test_a"),false);
  assert.equal(JSON.stringify(first).includes("other-member-thread"),false);
});

test("two distinct authenticated tester identities complete read-only cross-thread verification",async()=>{
  const x=fixture();
  await x.route.POST(x.request());
  x.setMember("user_internal_test_b");
  const r=await (await x.route.POST(x.request())).json();
  assert.equal(r.passed,true);
  assert.equal(r.foreignHistoryDenied,true);
  assert.equal(r.ownHistoryScoped,true);
  assert.equal(r.twoAccountCheckComplete,true);
  assert.equal(r.completedSessions,2);
  assert.equal(r.inferenceRequests,0);
});

test("a visible foreign thread or missing own history never records a successful check",async()=>{
  for (const opts of [{leaked:true},{emptyOwn:true}]) {
    const x=fixture(opts);
    const res=await x.route.POST(x.request());
    assert.equal(res.status,409);
    assert.equal(x.audit.size,0);
  }
});

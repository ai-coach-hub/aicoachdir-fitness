import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("dashboard contains no usage counter or status section",()=>{
 const page=read("app/dashboard/page.tsx");
 assert.doesNotMatch(page,/memberUsageDisplay|usage\.remaining|styles\.usageBar|aria-label="AI usage"/);
 assert.match(page,/Open Life Coach/);
});
test("Life Coach can return verified usage on demand without AI consumption",()=>{
 const route=read("app/api/life/chat/route.ts");
 assert.match(route,/memberUsageDisplay\(email\)/);
 const start=route.indexOf("if(/(?:how many");
 const next=route.indexOf("const supplied=",start);
 assert.ok(start>0 && next>start);
 const block=route.slice(start,next);
 assert.match(block,/source:"member-usage"/);
 assert.doesNotMatch(block,/reserveSharedUsage|reserveLifeLaunch|completeLifeCoachRequest/);
});

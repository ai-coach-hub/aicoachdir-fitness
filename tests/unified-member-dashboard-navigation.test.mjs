import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("authenticated membership uses one dashboard and preserves coach-specific destinations",()=>{
 const login=read("app/fitness/login/page.tsx");
 assert.match(login,/if \(user && hasAccess && !destination\) redirect\("\/dashboard"\)/);
 assert.match(login,/Choose Fitness, Budgeting, or Life Coach from your member dashboard/);
 const dashboard=read("app/dashboard/page.tsx");
 for(const link of ["/fitness/chat","/fitness/chat?view=workouts","/budgeting/launch?destination=coach","/budgeting/launch?destination=tracker","/life"])
  assert.ok(dashboard.includes(link),"Dashboard missing "+link);
 assert.match(dashboard,/memberHasFitnessAccess\(email, user.id\)/);
 assert.match(dashboard,/lifeTester\(\)/);
 assert.match(dashboard,/href="\/manage-subscription"/);
});
test("public pages guide returning members through one login without changing signup flow",()=>{
 assert.match(read("components/SiteHeader.tsx"),/Member Dashboard \/ Login/);
 assert.match(read("app/page.tsx"),/Member Dashboard \/ Login/);
 assert.match(read("components/SiteHeader.tsx"),/href="\/fitness\/login"/);
});

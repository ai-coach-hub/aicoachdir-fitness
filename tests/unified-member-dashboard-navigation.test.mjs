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
  assert.ok(read("lib/coachLaunchCatalog.mjs").includes(link),"Coach catalog missing "+link);
 assert.match(dashboard,/memberHasFitnessAccess\(email, user.id\)/);
 assert.match(dashboard,/lifeTester\(\)/);
 assert.match(dashboard,/href="\/manage-subscription"/);
});
test("public pages guide returning members through one login without changing signup flow",()=>{
 assert.match(read("components/SiteHeader.tsx"),/Member Login/);
 assert.match(read("app/page.tsx"),/Member Login/);
 assert.match(read("components/SiteHeader.tsx"),/href="\/fitness\/login"/);
});

test("eligible Life Coach members see My Goals in member tools without a second login",()=>{
 const dashboard=read("app/dashboard/page.tsx");
 assert.match(dashboard,/visibleMemberCoaches\(\{lifeAvailable\}\)/);assert.match(read("lib/coachLaunchCatalog.mjs"),/toolHref:"\/life\?goals=1"/);
 assert.match(read("lib/coachLaunchCatalog.mjs"),/Saved goals and habits/);
 const css=read("app/dashboard/dashboard.module.css");
 assert.match(css,/grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,260px\),1fr\)\)/);
});

test("returning member coach gateways never substitute an unverified secondary email",()=>{
 for(const path of ["app/fitness/chat/layout.tsx","app/budgeting/launch/route.ts"]){
   const source=read(path);
   assert.match(source,/primary\.verification\?\.status !== "verified"/);
   assert.match(source,/return primary\.emailAddress\.trim\(\)\.toLowerCase\(\)/);
   assert.doesNotMatch(source,/user\.emailAddresses\[0\]\?\.emailAddress/);
 }
});

test("Fitness history resolves only the member's verified primary identity",()=>{
 const source=read("app/api/fitness/chat/history/route.ts");
 assert.match(source,/primary\.verification\?\.status !== "verified"/);
 assert.match(source,/canonicalMemberEmail\(primary\.emailAddress\)/);
 assert.doesNotMatch(source,/user\.emailAddresses\[0\]\?\.emailAddress/);
});

test("public homepage leads with one membership and clear signup versus member login",()=>{
 const home=read("app/page.tsx");
 assert.match(home,/PERSONALIZED COACHING · ONE MEMBERSHIP/);
 assert.match(home,/<Link href="\/fitness\/signup" className="primary-button">Get Started<\/Link>/);
 assert.match(home,/<Link href=\{memberLoginUrl\} className="secondary-button">Member Login<\/Link>/);
 assert.match(home,/\$15\/month · One membership · 400 AI Coach messages\/month · Automatically renews until canceled/);
 assert.match(home,/lifeAvailable \? ", and work toward personal goals" : ""/);
 const signup=read("app/fitness/signup/page.tsx");
 assert.match(signup,/Already a member\? Sign in\./);
 assert.match(signup,/Keep using your coaches and saved tools without signing up again/);
 assert.match(signup,/Returning member login/);
});

test("signup does not repeat accepted Terms just because browser storage is unavailable",()=>{
 const createAccount=read("app/fitness/create-account/page.tsx");
 assert.doesNotMatch(createAccount,/if \(!value\)\s*\{\s*window\.location\.replace\(\`\/fitness\/signup/);
 assert.match(createAccount,/initialValues=\{email \? \{ emailAddress: email \} : undefined\}/);
 assert.match(createAccount,/setReady\(true\)/);
 const subscribe=read("app/fitness/subscribe/page.tsx");
 assert.match(subscribe,/currentMembershipTermsId\(email\)/);
 assert.match(subscribe,/if \(!acceptanceId\) redirect\(signupUrl\)/);
 const checkout=read("app/api/billing/create-checkout-session/route.ts");
 assert.match(checkout,/currentMembershipTermsId\(email\)/);
});

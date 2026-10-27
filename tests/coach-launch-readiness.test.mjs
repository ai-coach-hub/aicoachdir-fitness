import test from "node:test";
import assert from "node:assert/strict";
import {coachLaunchReadiness,canReleaseNewCoach} from "../lib/coachLaunchReadiness.mjs";
import {COACH_CATALOG} from "../lib/coachLaunchCatalog.mjs";
const approved={routeReady:true,providerConfigured:true,membershipVerified:true,sharedUsageIntegrated:true,
 idempotentRetriesTested:true,savedHistoryVerified:true,costPerMessageMeasured:true,
 fullUsageMarginApproved:true,syntheticSmokePassed:true,ownerApproved:true};
test("new coach cannot release with missing checks",()=>{
 const career=COACH_CATALOG.find(x=>x.slug==="career");
 assert.equal(canReleaseNewCoach(career,approved),false);
 assert.equal(coachLaunchReadiness({...approved,costPerMessageMeasured:false}).ready,false);
 assert.equal(coachLaunchReadiness({...approved,ownerApproved:false}).ready,false);
 assert.equal(coachLaunchReadiness(approved).ready,true);
});
test("release policy is fail closed for incomplete input",()=>{
 assert.equal(coachLaunchReadiness({}).ready,false);
 assert.equal(coachLaunchReadiness(null).missing.length,10);
 assert.equal(canReleaseNewCoach(null,approved),false);
});

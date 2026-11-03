import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../app/api/isolated-introductory-trial/checkout-readiness/route.ts",import.meta.url),"utf8");
test("private checkout preflight cannot start payments or write membership records",()=>{
 assert.match(source,/isolatedTrialPreviewEnabled\(\)/);
 assert.match(source,/resolveIsolatedIntroductoryAccount\(\)/);
 assert.match(source,/stripeMode\(\)==="test"/);
 assert.match(source,/stripeConfigured\(\)/);
 assert.match(source,/current_setting\('neon\.branch_id',true\)/);
 assert.match(source,/br-spring-cloud-aui2mogd/);
 assert.doesNotMatch(source,/stripeRequest\(|saveFitnessMembership\(|UPDATE\s|INSERT\s|DELETE\s/i);
});

import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const route=read("../app/api/isolated-introductory-trial/native-fitness-save/route.ts");
const native=read("../app/api/fitness/chat/route.ts");
test("native Pickaxe save is test-only, same-origin, identity bound and at most one charge",()=>{
 assert.match(route,/isolatedTrialPreviewEnabled\(\)/);
 assert.match(route,/origin!==new URL\(request.url\).origin/);
 assert.match(route,/INTRODUCTORY_TRIAL_DEDICATED_TEST_CLERK_ID/);
 assert.match(route,/verifiedIsolatedPaidContinuation\(\)/);
 assert.match(route,/introHistorySql\(\)/);
 assert.match(route,/const REQUEST_KEY="native-fitness-save-qa-20261107"/);
 assert.match(route,/shared_ai_reserve/);
 assert.match(route,/shared_ai_settle/);
 assert.match(route,/if\(reserved!=="reserved"\)/);
 assert.match(route,/executeIsolatedNativeFitnessSaveForTester/);
 assert.match(route,/savedPlanVerified===true/);
 assert.match(route,/after.plan!==null/);
 assert.match(route,/outcome:"completed"\|"uncertain"/);
 assert.doesNotMatch(route,/INSERT INTO (?!public\.isolated_fitness_provider_diagnostics)|CREATE TABLE|DELETE FROM|stripeRequest\(|checkout\.sessions/);
});
test("native driver uses production workout action but requires preview AND existing test subscription",()=>{
 assert.match(native,/export async function executeIsolatedNativeFitnessSaveForTester/);
 assert.match(native,/if\(!isolatedTrialPreviewEnabled\(\)\)/);
 assert.match(native,/INTRODUCTORY_TRIAL_DEDICATED_TEST_CLERK_ID/);
 assert.match(native,/verifiedIsolatedPaidContinuation\(\)/);
 assert.match(native,/return postFitnessWithoutPreviewMeter\(request,\{clerkId,email\}\)/);
});

test("provider failure diagnostics remain TEST-only, redacted and durable without retries",()=>{
 assert.match(native,/mutationProviderDiagnostic = "not_received"/);
 assert.match(native,/if \(!driverResponse\.ok\)/);
 assert.match(native,/raw\.slice\(0, 2048\)\.toLowerCase\(\)/);
 assert.match(native,/\.\.\.\(verifiedTrial \? \{ providerDiagnostic:/);
 assert.match(route,/isolated_fitness_provider_diagnostics/);
 assert.match(route,/ON CONFLICT \(request_key\) DO NOTHING/);
 assert.match(route,/diagnostic-store-unavailable/);
 assert.doesNotMatch(route,/console\.(?:log|warn|error)\([^\n]*(?:raw|token|providerDiagnostic)/);
});

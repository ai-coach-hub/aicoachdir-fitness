import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const route=readFileSync(new URL("../app/api/isolated-introductory-trial/chat/route.ts",import.meta.url),"utf8");
test("preview chat diagnostics identify stages without dumping sensitive payloads",()=>{
 for(const stage of ["provider_missing","provider_http_error","provider_invalid_json","provider_rejected","provider_empty_response","provider_network_failure","history_persist_failure"])
  assert.ok(route.includes(stage),stage);
 assert.match(route,/if\(!isolatedTrialPreviewEnabled\(\)\)return;/);
 assert.doesNotMatch(route,/console\.(?:warn|error|log)\([^\n]*(?:token|payload|message\.trim|verifiedEmail)/);
 assert.match(route,/if\(response\.status===404\)return \{kind:"no-model" as const\}/);
 assert.match(route,/if\(result\.status==="released"\)/);
 // Ensure all trial coaches use the minimal Pickaxe request that worked in this sandbox.
 assert.match(route,/body:JSON\.stringify\(\{message:message\.trim\(\),stream:false\}\)/);
 assert.doesNotMatch(route,/body:JSON\.stringify\(\{[^}]*userId:/);
});

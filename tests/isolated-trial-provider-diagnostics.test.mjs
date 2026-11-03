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
 // Confirm Life Coach uses the known-good minimal Pickaxe request,
 // without changing the other coaches\u0027 identity and conversation fields.
 assert.match(route,/selected==="fitness"\s*\?\{message:message\.trim\(\),userId:account\.verifiedEmail/);
 assert.match(route,/:\{message:message\.trim\(\),stream:false\}/);
 assert.match(route,/conversationId:`intro-\$\{selected\}-\$\{key\}`/);
});

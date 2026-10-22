import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const client=readFileSync(new URL("../app/life/LifeChat.tsx",import.meta.url),"utf8");
const route=readFileSync(new URL("../app/api/life/chat/route.ts",import.meta.url),"utf8");

test("Life Chat submits a request key but does not expose member identity or allowance",()=>{
 assert.match(client,/requestKey/);
 assert.match(client,/crypto\.randomUUID\(\)/);
 assert.match(client,/body:JSON\.stringify\(\{message,requestKey/);
 assert.doesNotMatch(client,/subscriptionKey|periodStart|memberId|limit_uses/);
});

test("retries reuse the request key for the same text and conversation",()=>{
 assert.match(client,/previous\?\.message===message && previous\?\.conversationId===id/);
 assert.match(client,/pendingRequest\.current=\{key:requestKey,message,conversationId:id,newConversationId\}/);
 assert.match(client,/newConversationId=!id/);
 assert.match(client,/source:"recovered-history"|\/api\/life\/chat\?id=/);
 assert.match(client,/pendingRequest\.current=null/);
});

test("preview meter stays behind both environment flags and memory returns before reserving",()=>{
 const indexSave=route.indexOf('await saveLifeTurn(member,id,message,response);');
 const indexRecall=route.indexOf('if(direct!==null)');
 const indexMeter=route.indexOf('PREVIEW_SHARED_USAGE_METER_ENABLED === "true"');
 const indexReservation=route.indexOf('runMeteredPreviewGeneration(',indexMeter);
 assert.ok(indexSave>0 && indexRecall>indexSave && indexMeter>indexRecall && indexReservation>indexMeter);
 assert.match(route,/process\.env\.VERCEL_ENV === "preview"/);
 assert.match(route,/process\.env\.VERCEL_GIT_COMMIT_REF === "feature\/life-coach-agent-sandbox-20261011"/);
 assert.match(route,/const subscriptionKey=previewLifeTestSubscription/);
 assert.match(route,/const periodStart=previewLifeTestPeriod/);
 assert.match(route,/if\(!enrollment\.active\) return json/);
 assert.doesNotMatch(route,/subscriptionKey=body\.|periodStart=body\./);
});

test("preview counter separates completed uses from pending verification without a paid request",()=>{
 assert.match(client,/usageTest\.used/);
 assert.match(client,/usageTest\.pending/);
 assert.match(client,/pending verification/);
});

test("private Life generation cannot bypass enrollment or the shared meter",()=> {
 assert.match(route,/if\(!enrollment\.active\) return json\(\{ok:false,error:"Private usage test enrollment is required\."\},403\)/);
 assert.match(route,/if \(!privateSandbox \|\| process\.env\.PREVIEW_SHARED_USAGE_METER_ENABLED !== "true"\)/);
 assert.match(route,/return json\(\{ok:false,error:"Private Life Coach generation is not enabled\."\},503\)/);
 assert.equal((route.match(/fetch\("https:\/\/api\.pickaxe\.co\/v1\/completions"/g)||[]).length,1);
});

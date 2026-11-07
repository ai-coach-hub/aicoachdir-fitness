import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const lib=read("../lib/privateNativeReadback.ts");
const api=read("../app/api/isolated-introductory-trial/native-readback/route.ts");
const ui=read("../app/introductory-preview/native-verification/page.tsx");
test("private native readback is preview-only and dedicated Clerk account only",()=>{
 assert.match(lib,/isolatedTrialPreviewEnabled\(\)/);
 assert.match(lib,/currentUser\(\)/);
 assert.match(lib,/primary\.verification\?\.status!=="verified"/);
 assert.match(lib,/INTRODUCTORY_TRIAL_DEDICATED_TEST_CLERK_ID/);
 assert.match(lib,/introHistorySql\(\)/);
 assert.match(api,/if\(!isolatedTrialPreviewEnabled\(\)\)/);
 assert.match(api,/status:403/);
 assert.doesNotMatch(api,/export async function POST/);
});
test("readback covers member-scoped saved native work and converted trial records",()=>{
 for(const table of ["workout_plan_cache","budget_member_months","budget_chat_messages",
  "life_chat_messages","introductory_trial_history","introductory_paid_history",
  "introductory_trial_grants","fitness_memberships"])
  assert.ok(lib.includes("public."+table),table);
 assert.match(lib,/member_email=\$\{email\}/);
 assert.match(lib,/member_id=\$\{user\.id\}/);
 assert.match(lib,/clerk_user_id=\$\{user\.id\}/);
 assert.match(lib,/email=\$\{email\}/);
 assert.doesNotMatch(lib+api,/INSERT INTO|UPDATE public\.|DELETE FROM|stripeRequest\(|checkout\.stripe\.com/);
 assert.match(ui,/isolated-introductory-trial\/native-readback/);
 assert.match(ui,/not proof of a new save/);
});

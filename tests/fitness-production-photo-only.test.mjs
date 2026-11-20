import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = path => readFileSync(new URL("../"+path,import.meta.url),"utf8");
const store=source("lib/coachAttachmentStorage.ts");
const upload=source("app/api/coach-attachments/route.ts");
const relay=source("app/api/fitness/chat/route.ts");
const ui=source("app/fitness/chat/page.tsx");
const picker=source("components/ChatAttachmentPicker.tsx");
const retention=source("app/api/internal/coach-attachment-retention/route.ts");
const config=JSON.parse(source("vercel.json"));

test("private photo feature only on production with production branch and bucket",()=>{
 assert.match(store,/process\.env\.VERCEL_ENV === "production"/);
 assert.match(store,/COACH_ATTACHMENTS_API_ENABLED === "true"/);
 assert.match(store,/br-sparkling-glitter-aucpz59d/);
 assert.match(store,/coach-member-attachments"/);
 assert.doesNotMatch(store,/coach-member-attachments-preview|br-autumn-breeze/);
 assert.match(store,/current_setting\('neon\.branch_id',true\)/);
 assert.match(store,/X-Amz-Expires": "120"/);
});
test("uploads and reads are member protected and bounded",()=>{
 assert.match(upload,/primary\.verification\?\.status !== "verified"/);
 assert.match(upload,/memberHasFitnessAccess\(email, member\.id\)/);
 assert.match(upload,/image\.size > MAX_PREPARED_PHOTO_BYTES\(\)/);
 assert.match(upload,/await storeImage\(key/);
 assert.match(upload,/COACH_ATTACHMENT_OWNER_EMAILS/);
 assert.match(upload,/ownerView && !isOwner/);
 assert.match(upload,/member_email = \$\{memberEmail\}/);
 assert.match(upload,/request\.headers\.get\("origin"\)/);
 assert.match(store,/looksLikeJpeg\(bytes\)/);
});
test("photo goes only into existing non-mutating completion with private authorization",()=>{
 assert.match(relay,/authorizeAttachedPhoto\(\{id:attachmentId,email:memberEmail,coach:"fitness",conversationId\}\)/);
 assert.match(relay,/if \(photoUrl && mustConfirmSavedPlanMutation\)/);
 assert.match(relay,/\.\.\.\(photoUrl \? \{imageUrls:\[photoUrl\]\} : \{\}\)/);
 assert.equal((relay.match(/imageUrls:\[photoUrl\]/g)||[]).length,1);
 assert.match(ui,/ChatAttachmentPicker/);
 assert.match(ui,/ChatPhotoAttachment/);
 assert.match(ui,/onPhotoAttachment=/);
 assert.match(ui,/member-photo\.jpg/);
 assert.match(ui,/\/api\/coach-attachments/);
 assert.match(ui,/My attached photos/);
 assert.match(picker,/Pressing Send shares this attachment with the AI coach/);
 assert.doesNotMatch(ui,/imageUrls:|signedPhotoUrl\(/);
});
test("retention scheduled safely and excludes unrelated fitness jobs",()=>{
 assert.equal(config.git.deploymentEnabled,false);
 assert.deepEqual(config.crons,[{path:"/api/internal/coach-attachment-retention",schedule:"0 4 * * *"}]);
 assert.match(retention,/timingSafeEqual/);
 assert.match(retention,/attachmentsEnabled\(\)/);
 assert.match(retention,/purgeExpiredPhotos\(30\)/);
 assert.match(store,/await removeImage\(String\(row\.object_key\)\)/);
});

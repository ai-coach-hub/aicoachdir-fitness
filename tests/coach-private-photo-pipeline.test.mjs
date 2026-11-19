import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const storage = source("lib/coachAttachmentStorage.ts");
const route = source("app/api/coach-attachments/route.ts");
const fitnessRoute = source("app/api/fitness/chat/route.ts");
const lifeRoute = source("app/api/life/chat/route.ts");
const picker = source("components/ChatAttachmentPicker.tsx");
const fitness = source("app/fitness/chat/page.tsx");
const life = source("app/life/LifeChat.tsx");
const viewer = source("components/ChatPhotoAttachment.tsx");

test("private uploads are restricted to one isolated preview branch and configured storage", () => {
  assert.match(storage, /process\.env\.VERCEL_ENV === "preview"/);
  assert.match(storage, /process\.env\.VERCEL_GIT_COMMIT_REF === ALLOWED_GIT_BRANCH/);
  assert.match(storage, /COACH_ATTACHMENTS_API_ENABLED/);
  assert.match(storage, /br-autumn-breeze-auw38rgr/);
  assert.match(storage, /SELECT current_setting\('neon\.branch_id',true\)/);
  assert.match(route, /request\.headers\.get\("origin"\) !== new URL\(request\.url\)\.origin/);
  assert.match(route, /memberHasFitnessAccess\(email, member\.id\)/);
  assert.match(route, /primary\.verification\?\.status !== "verified"/);
  assert.match(route, /Number\(count\[0\]\?\.total \|\| 0\) >= 10/);
  assert.match(route, /image\.size > MAX_PREPARED_PHOTO_BYTES\(\)/);
  assert.match(storage, /looksLikeJpeg\(bytes\)/);
  assert.match(route, /await storeImage\(key/);
  assert.doesNotMatch(route, /access: "public"|access: 'public'/);
});

test("private photo references are member and conversation bound and signed briefly", () => {
  assert.match(storage, /member_email = \$\{args\.email\}/);
  assert.match(storage, /conversation_id = \$\{args\.conversationId\}/);
  assert.match(storage, /expires_at > now\(\)/);
  assert.match(storage, /"X-Amz-Expires": "120"/);
  assert.match(fitnessRoute, /if \(attachmentId && !photoUrl\)/);
  assert.match(fitnessRoute, /if \(photoUrl && mustConfirmSavedPlanMutation\)/);
  assert.match(fitnessRoute, /imageUrls: \[photoUrl\]/);
  assert.match(lifeRoute, /imageUrls:\[photoUrl\]/);
  assert.match(fitness, /\[Attached photo reference: /);
  assert.match(life, /\[Attached photo reference: /);
  assert.match(viewer, /api\/coach-attachments\?id=/);
  assert.doesNotMatch(viewer, /sessionStorage|localStorage/);
});

test("owner history is explicitly opt-in and raw private bytes can be deleted", () => {
  assert.match(route, /COACH_ATTACHMENT_OWNER_EMAILS/);
  assert.match(route, /ownerView && !isOwner/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /await removeImage\(String\(rows\[0\]\.object_key\)\)/);
  assert.match(route, /DELETE FROM public\.coach_chat_attachments/);
  assert.match(storage, /purgeExpiredPhotos/);
  assert.match(storage, /WHERE expires_at <= now\(\)/);
  assert.match(picker, /photoSendingEnabled/);
  assert.match(picker, /onPhotoAttachment\?\.\(\{ name:/);
  assert.match(fitness, /\/api\/coach-attachments/);
  assert.match(life, /\/api\/coach-attachments/);
});

test("photos and documents are not sent as arbitrary client-supplied external URLs", () => {
  assert.doesNotMatch(fitness, /imageUrls:|signedPhotoUrl\(/);
  assert.doesNotMatch(life, /imageUrls:|signedPhotoUrl\(/);
  assert.match(storage, /"UNSIGNED-PAYLOAD"/);
  assert.match(storage, /createHmac\("sha256"/);
  assert.doesNotMatch(route, /request\.json\(\).*url|public_read/);
});

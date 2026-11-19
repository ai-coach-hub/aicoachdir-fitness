import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const attachment = source("components/ChatAttachmentPicker.tsx");
const fitness = source("app/fitness/chat/page.tsx");
const life = source("app/life/LifeChat.tsx");

test("Add file appears directly alongside Send under Fitness and Life threads", () => {
  assert.match(fitness, /<form className="member-chat-form" onSubmit=\{send\}>/);
  assert.match(fitness, /<ChatAttachmentPicker key=\{attachmentPickerRevision\} disabled=\{running\} onPendingChange=\{setAttachmentPending\} onTextAttachment=\{setAttachmentText\}/);
  assert.doesNotMatch(fitness, /File attachment preview \(no upload\)/);
  assert.match(life, /<form onSubmit=\{send\} className=\{styles\.compose\}>/);
  assert.match(life, /<ChatAttachmentPicker key=\{attachmentPickerRevision\} disabled=\{busy\|\|openingThread\} onPendingChange=\{setAttachmentPending\} onTextAttachment=\{setAttachmentText\}/);
  assert.match(attachment, /Add file/);
});

test("plain text and CSV send through existing Pickaxe conversation; unsupported formats remain blocked", () => {
  assert.match(fitness, /if \(!message \|\| running \|\| attachmentPending\) return/);
  assert.match(fitness, /disabled=\{running \|\| attachmentPending \|\| !input\.trim\(\)\}/);
  assert.match(life, /if\(!typedMessage\|\|busy\|\|openingThread\|\|attachmentPending\)return/);
  assert.match(life, /disabled=\{busy\|\|openingThread\|\|attachmentPending\|\|!input\.trim\(\)\}/);
  assert.match(attachment, /onPendingChange\(true\)/);
  assert.match(attachment, /onPendingChange\(false\)/);
  assert.match(attachment, /Preview only\. Sending this file type is not enabled\./);
  assert.match(attachment, /selected\.text\(\)/);
  assert.match(attachment, /onTextAttachment\?\.\(text\)/);
  assert.match(fitness, /message: deliveredMessage, conversationId/);
  assert.match(life, /Member-attached file/);
  assert.doesNotMatch(attachment, /fetch\(|XMLHttpRequest|sendBeacon|sessionStorage|localStorage/);
});

test("inline file selection is constrained and photo preview strips location metadata", () => {
  assert.match(attachment, /MAX_BYTES = 8 \* 1024 \* 1024/);
  assert.match(attachment, /new Set\(\["jpg", "jpeg", "png", "webp", "pdf", "docx", "xlsx", "csv", "txt"\]\)/);
  assert.match(attachment, /createImageBitmap\(selected\)/);
  assert.match(attachment, /canvas\.toBlob\(resolve, "image\/jpeg", 0\.78\)/);
  assert.match(attachment, /URL\.revokeObjectURL/);
  assert.match(attachment, /type="file"/);
  assert.match(attachment, /type="button"/);
});

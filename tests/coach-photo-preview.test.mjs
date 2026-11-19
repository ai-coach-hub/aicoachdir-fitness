import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const preview = source("app/fitness/photo-preview/page.tsx");
const styles = source("app/fitness/photo-preview/PhotoPreview.module.css");
const chat = source("app/fitness/chat/page.tsx");

test("file attachment preview is isolated and never uploads documents or images", () => {
  assert.match(preview, /PRIVATE FEATURE PREVIEW/);
  assert.match(preview, /Nothing is uploaded, saved, or sent to Pickaxe/);
  assert.match(preview, /type="file"/);
  assert.match(preview, /const FILE_ACCEPT = "\.jpg,\.jpeg,\.png,\.webp,\.pdf,\.txt,\.csv,\.docx,\.xlsx"/);
  assert.match(preview, /aria-label="Prepare a coaching attachment"/);
  assert.match(preview, /disabled title="Secure attachment delivery to the coach is not yet connected"/);
  assert.match(chat, /href="\/fitness\/photo-preview"/);
  assert.match(preview, /URL\.revokeObjectURL/);
  assert.doesNotMatch(preview, /fetch\(|sendBeacon|XMLHttpRequest|\.submit\(|<form/);
  assert.doesNotMatch(preview, /PickaxeConfig|https:\/\/api\.pickaxe/);
});

test("photo validation bounds inputs and strips metadata on-device", () => {
  assert.match(preview, /8 \* 1024 \* 1024/);
  assert.match(preview, /2 \* 1024 \* 1024/);
  assert.match(preview, /MAX_EDGE_PX = 1600/);
  assert.match(preview, /createImageBitmap\(file\)/);
  assert.match(preview, /canvas\.toBlob\(resolve, "image\/jpeg", 0\.78\)/);
  assert.match(preview, /bitmap\.close\(\)/);
  assert.match(preview, /MAX_OUTPUT_BYTES/);
  assert.match(preview, /maxLength=\{1200\}/);
  assert.match(styles, /\.preview/);
  assert.match(styles, /\.notice/);
  assert.match(styles, /\.documentPanel/);
});
test("document files are only identified by name, size and allowed type", () => {
  for (const extension of ["pdf", "txt", "csv", "docx", "xlsx"]) {
    assert.match(preview, new RegExp(extension + ":"));
  }
  assert.match(preview, /const MAX_DOCUMENT_BYTES = 8 \* 1024 \* 1024/);
  assert.match(preview, /file\.size === 0 \|\| file\.size > MAX_DOCUMENT_BYTES/);
  assert.match(preview, /file\.type && file\.type !== expected/);
  assert.match(preview, /kind: "document"/);
  assert.match(preview, /Contents are not opened in this preview/);
  assert.match(preview, /const prepared = await prepareAttachment\(file\)/);
  assert.match(preview, /if \(previous\?\.kind === "image"\) URL\.revokeObjectURL\(previous\.objectUrl\)/);
  assert.doesNotMatch(preview, /FileReader|\.text\(\)|\.arrayBuffer\(\)|\.pdf\.parse|\.submit\(/);
});

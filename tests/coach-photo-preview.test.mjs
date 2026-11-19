import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const preview = source("app/fitness/photo-preview/page.tsx");
const styles = source("app/fitness/photo-preview/PhotoPreview.module.css");
const chat = source("app/fitness/chat/page.tsx");

test("photo preview is isolated, accessible and clearly never uploads images or calls Pickaxe", () => {
  assert.match(preview, /PRIVATE FEATURE PREVIEW/);
  assert.match(preview, /Nothing is uploaded, saved, or sent to Pickaxe/);
  assert.match(preview, /type="file"/);
  assert.match(preview, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(preview, /aria-label="Prepare a coaching photo"/);
  assert.match(preview, /disabled title="Secure photo delivery to the coach is not yet connected"/);
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
});
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function pageSource() {
  return readFile(new URL("../app/fitness/chat/page.tsx", import.meta.url), "utf8");
}

async function cssSource() {
  return readFile(new URL("../app/globals.css", import.meta.url), "utf8");
}

test("coach chat shows an in-thread working indicator while a response is pending", async () => {
  const text = await pageSource();

  assert.match(text, /running \? \(/);
  assert.match(text, /className="chat-bubble coach coach-working"/);
  assert.match(text, /Working on your response/);
  assert.match(text, /coach-working-dots/);
});

test("chat scrolls to the newest content when messages or pending state change", async () => {
  const text = await pageSource();

  assert.match(text, /const chatEndRef = useRef<HTMLDivElement \| null>\(null\)/);
  assert.match(text, /chatEndRef\.current\?\.scrollIntoView/);
  assert.match(text, /\[messages, running, tab\]/);
  assert.match(text, /ref=\{chatEndRef\}/);
});

test("working indicator has animated dot styling", async () => {
  const text = await cssSource();

  assert.match(text, /\.coach-working-dots i/);
  assert.match(text, /@keyframes coach-working-pulse/);
});

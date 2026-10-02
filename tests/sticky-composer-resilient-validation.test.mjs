import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function routeSource() {
  return readFile(new URL("../app/api/fitness/chat/route.ts", import.meta.url), "utf8");
}

async function cssSource() {
  return readFile(new URL("../app/globals.css", import.meta.url), "utf8");
}

test("validation polling retries transient Action-history lookup failures", async () => {
  const text = await routeSource();

  assert.match(text, /action-poll-retry/);
  assert.match(text, /if \(signal\.aborted\) break;/);
  assert.match(text, /setTimeout\(finish, 750\)/);
  assert.match(text, /signal\.removeEventListener\("abort", finish\)/);
  assert.doesNotMatch(
    text,
    /error: "Workout update validation could not be checked\."/,
  );
});

test("composer stays in normal flow and cannot cover chat messages", async () => {
  const text = await cssSource();

  assert.match(text, /\.member-chat-messages \{[\s\S]*?min-height: 0;/);
  assert.match(text, /\.member-chat-form \{[\s\S]*?position: relative;/);
  assert.match(text, /\.member-chat-form \{[\s\S]*?background: transparent;/);
  assert.doesNotMatch(text, /\.member-chat-form \{[\s\S]*?position: sticky;/);
  assert.doesNotMatch(text, /\.member-chat-form \{[\s\S]*?bottom: 0;/);
});

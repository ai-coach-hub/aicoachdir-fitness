import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("standalone workout requests and previous chats stay supported", async () => {
  const route = await readFile(new URL("../app/api/fitness/chat/route.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/fitness/chat/page.tsx", import.meta.url), "utf8");
  const history = await readFile(new URL("../app/api/fitness/chat/history/route.ts", import.meta.url), "utf8");

  assert.ok(route.includes("requiresConfirmedSavedPlanMutation"));
  assert.ok(route.includes("explicitlyDeclinesWorkoutSave"));
  assert.ok(route.includes("if (mustConfirmSavedPlanMutation)"));
  assert.ok(page.includes("Previous Chats"));
  assert.ok(page.includes("/api/fitness/chat/history"));
  assert.ok(history.includes("/studio/workspace/history"));
  assert.ok(history.includes('format: "messages"'));
});

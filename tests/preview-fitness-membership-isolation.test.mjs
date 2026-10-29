import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/fitnessMembershipDb.ts", "utf8");

test("Fitness sandbox has its own connection without production URL fallback", () => {
  assert.match(source, /function onFitnessPreviewSandbox\(\)/);
  assert.match(source, /process\.env\.VERCEL_ENV === "preview"/);
  assert.match(source, /process\.env\.VERCEL_GIT_COMMIT_REF === PREVIEW_SANDBOX_BRANCH/);
  assert.match(source, /if \(onFitnessPreviewSandbox\(\)\) \{[\s\S]*?process\.env\.LIFE_COACH_DATABASE_URL/);
  assert.ok(source.indexOf("return isolated;") < source.indexOf("process.env.STORAGE_URL"));
});
test("Sandbox branch verified before schema reads or writes", () => {
  assert.match(source, /const PREVIEW_NEON_BRANCH_ID = "br-autumn-breeze-auw38rgr"/);
  assert.match(source, /current_setting\('neon\.branch_id', true\)/);
  assert.match(source, /const sql = await verifiedMembershipDb\(\)/);
  assert.match(source, /throw new Error\("Sandbox membership database branch mismatch\."\)/);
});
test("Sandbox does not enroll legacy Pickaxe members on first access", () => {
  assert.match(source, /if \(onFitnessPreviewSandbox\(\) \|\| onUpgradeQaPreview\(\)\) return false;\s*const legacyActive = await pickaxeUserHasFitnessAccess/);
});

test("Upgrade QA has isolated database and rejects production fallback", () => {
  assert.match(source, /const UPGRADE_QA_NEON_BRANCH_ID = "br-young-salad-aubnf7xt"/);
  assert.match(source, /if \(process\.env\.VERCEL_GIT_COMMIT_REF === UPGRADE_QA_BRANCH\)/);
  assert.match(source, /process\.env\.UPGRADE_SANDBOX_DATABASE_URL/);
  assert.match(source, /onUpgradeQaPreview\(\) \? UPGRADE_QA_NEON_BRANCH_ID/);
});

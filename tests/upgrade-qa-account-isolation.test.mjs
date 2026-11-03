import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const page=readFileSync(new URL("../app/manage-subscription/page.tsx",import.meta.url),"utf8");
test("isolated QA subscription page skips all legacy billing and renders preview controls",()=>{
 assert.match(page,/email && user && emailVerified && !isolatedUpgradeQa/);
 assert.match(page,/isolatedUpgradeQa \? \(\s*<>[\s\S]*?<SandboxUpgradeClient\s*\/>/);
 assert.match(page,/process\.env\.VERCEL_GIT_COMMIT_REF === "feature\/verified-subscription-upgrade-policy-20261027"/);
 assert.match(page,/linkVerifiedLegacyStripeMembership/);
});

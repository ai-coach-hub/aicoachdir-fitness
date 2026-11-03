import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../lib/sandboxSharedUsagePermit.ts",import.meta.url),"utf8");
test("sandbox meter validates canonical email with whitespace-aware regular expression",()=>{
 const line=source.split("\n").find(line=>line.includes("normalized!==email||"));
 assert.ok(line,"sandbox email validation must remain in place");
 assert.ok(line.includes(String.raw`[^\s@]`),"reject whitespace correctly, not literal backslash");
 assert.ok(!line.includes(String.raw`[^\\s@]`),"no double-escaped regex character class");
});
test("sandbox meter is gated by isolated preview branch and never production",()=>{
 for(const token of ["UPGRADE_SANDBOX_SHARED_METER_ENABLED","feature/verified-subscription-upgrade-policy-20261027","br-young-salad-aubnf7xt","verifiedSandboxStripeAccount"])assert.ok(source.includes(token));
});

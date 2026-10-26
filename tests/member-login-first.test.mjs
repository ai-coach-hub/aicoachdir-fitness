import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../components/FitnessMemberLoginClient.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("anonymous users see the Clerk sign-in ahead of legacy account help", () => {
  const anonymous = source.slice(source.lastIndexOf("  return ("));
  assert.ok(anonymous.indexOf("<SignIn") >= 0);
  assert.ok(anonymous.indexOf("<SignIn") < anonymous.indexOf("<details"));
  assert.match(anonymous, /<summary>Need help accessing an older account\?<\/summary>/);
  assert.match(anonymous, /href="\/fitness\/legacy-account"/);
  assert.match(anonymous, /href="\/manage-subscription"/);
});

test("existing-member and payment recovery flows remain intact", () => {
  assert.match(source, /if \(accessCheckFailed\)/);
  assert.match(source, /if \(hasAccess\)/);
  assert.match(source, /paymentNeedsAttention/);
  assert.match(source, /Reactivate Membership/);
  assert.match(source, /forceRedirectUrl=\{loginReturnUrl\}/);
  assert.match(css, /\.member-login-help summary/);
});

import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
const page=readFileSync("app/manage-subscription/page.tsx","utf8");
test("subscription support does not expose an email fallback",()=>{
 assert.ok(page.includes('<SupportContactForm defaultTopic="Billing / Cancellation" />'));
 assert.ok(page.includes("https://aicoachdir.com/contact"));
 assert.doesNotMatch(page,/mailto:|supportEmail|Ai\.coach\.hub\.domain@gmail\.com/);
});

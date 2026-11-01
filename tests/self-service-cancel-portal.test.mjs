import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("members can self-serve cancellation through secure Stripe portal",()=>{
 const page=read("app/manage-subscription/page.tsx");
 const portal=read("app/api/billing/customer-portal/route.ts");
 assert.match(page, /Manage or Cancel Subscription/);
 assert.match(page, /action="\/api\/billing\/customer-portal"/);
 assert.doesNotMatch(page, /action="\/api\/billing\/cancel-renewal"/);
 assert.match(portal, /\/billing_portal\/sessions/);
 assert.match(portal, /membership\.clerk_user_id/);
 assert.match(portal, /return_url/);
});

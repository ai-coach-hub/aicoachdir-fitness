import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = async path => readFile(new URL("../" + path, import.meta.url), "utf8");
test("billing page treats existing and new members with the same language",async()=>{
 const page=await source("app/manage-subscription/page.tsx");
 assert.doesNotMatch(page,/earlier billing system|older (?:billing|Pickaxe)|subscribed through an earlier system/i);
 assert.match(page,/confirm your billing account/i);
 assert.match(page,/contact support/i);
});
test("existing subscriber sign-in never advertises a second paid subscription",async()=>{
 const client=await source("components/FitnessMemberLoginClient.tsx");
 assert.doesNotMatch(client,/Newer AI Coach Directory members|Returning Pickaxe Fitness members only/i);
 assert.match(client,/same email/i);
});
test("verified match helper never uses email alone to expose portal",async()=>{
 const portal=await source("app/api/billing/customer-portal/route.ts");
 assert.match(portal,/getFitnessMembership\(/);
 assert.doesNotMatch(portal,/searchParams\.get\(["']customer/);
});

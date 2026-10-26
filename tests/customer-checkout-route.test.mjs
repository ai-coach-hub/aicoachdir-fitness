import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("checkout button calls the real same-origin billing API",()=>{
 const card=read("components/FitnessCheckoutCard.tsx");
 const api=read("app/api/billing/create-checkout-session/route.ts");
 assert.match(card,/fetch\("\/api\/billing\/create-checkout-session"/);
 assert.doesNotMatch(card,/\/fitness\/api\/billing\/create-checkout-session/);
 assert.match(api,/export async function POST\(request: Request\)/);
 assert.match(api,/checkCheckoutRisk\(email, storedCustomerId\)/);
 assert.match(api,/idempotencyKey:/);
});
test("checkout accurately describes existing three-coach membership",()=>{
 const card=read("components/FitnessCheckoutCard.tsx");
 assert.match(card,/Fitness, Budgeting, and Life Coach/);
 assert.match(card,/400 AI Coach Messages per month/);
 assert.match(card,/automatically until canceled/i);
});

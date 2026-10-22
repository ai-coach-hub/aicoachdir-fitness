import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const route=readFileSync(new URL("../app/api/fitness/chat/route.ts",import.meta.url),"utf8");
const wallet=readFileSync(new URL("../lib/sharedUsageMeter.ts",import.meta.url),"utf8");

test("Fitness chat uses the authoritative production shared-wallet release gate instead of an incomplete copy",()=>{
 const post=route.slice(route.indexOf("export async function POST("),route.indexOf("async function postFitnessWithoutPreviewMeter("));
 assert.ok(post.includes("SHARED_USAGE_OPENING_BALANCES_RECONCILED") &&
   post.includes("SHARED_USAGE_CUTOVER_AT") &&
   post.includes("cutoverReady"),"Fitness POST must require opening balance review and valid cutover");
 assert.ok(post.includes("SHARED_USAGE_PUBLIC_RELEASE_APPROVED"),"Fitness POST must require public release approval");
 assert.ok(wallet.includes("SHARED_USAGE_OPENING_BALANCES_RECONCILED") &&
   wallet.includes("SHARED_USAGE_CUTOVER_AT"),"Canonical gate must require cutover and opening balance review");
});

test("An incomplete production launch never routes a member to unmetered Fitness AI generation",()=>{
 const post=route.slice(route.indexOf("export async function POST("),route.indexOf("async function postFitnessWithoutPreviewMeter("));
 assert.match(post,/SHARED_USAGE_PUBLIC_RELEASE_APPROVED/);
 assert.match(post,/!sharedReady/);
 assert.match(post,/status:503/);
});

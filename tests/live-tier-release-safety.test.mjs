import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const p=readFileSync("lib/liveTierCatalogApproval.ts","utf8");
const migration=readFileSync("migrations/20261029_live_plan_changes_candidate.sql","utf8");
test("live catalog refuses adopting Stripe prices merely by amount",()=>{
 assert.match(p,/unapproved_price/);assert.match(p,/unverified_price/);
 assert.match(p,/livemode/);assert.match(p,/intervalCount/);
 assert.match(p,/LIVE_TIER_/);
});
test("production migration is additive and does not rewrite member history",()=>{
 assert.match(migration,/CREATE TABLE IF NOT EXISTS public\.member_plan_change_intents/);
 assert.match(migration,/CREATE UNIQUE INDEX IF NOT EXISTS member_one_open_plan_change/);
 assert.doesNotMatch(migration,/\b(DELETE FROM|TRUNCATE|DROP TABLE|ALTER TABLE public\.fitness_memberships|UPDATE public\.shared_ai_usage_periods)\b/i);
});

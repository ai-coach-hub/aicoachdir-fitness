import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const get=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const meter=get("lib/lifeLaunchAllowance.ts");
const handler=get("app/api/life/chat/route.ts");
const sql=get("migrations/20261023_life_launch_allowance.sql");
test("midcycle benefit is Life-only, opt-in and independent of normal 400-credit wallet",()=>{
 assert.match(meter,/LIFE_LAUNCH_ALLOWANCE_ENABLED==="true"/);
 assert.match(meter,/start>=cutover/);
 assert.match(meter,/getFitnessMembership\(email\)/);
 assert.match(meter,/stripeRequest\("\/subscriptions\//);
 assert.match(meter,/customer\.email/);
 assert.match(meter,/life_launch_reserve/);
 assert.doesNotMatch(meter,/shared_ai_reserve|shared_ai_settle/);
});
test("generation uses verified atomic reservation and settles only its chosen wallet",()=>{
 assert.match(handler,/main\.status!=="pending_renewal"/);
 assert.match(handler,/reserveLifeLaunch\(email,requestKey\)/);
 assert.match(handler,/benefit==="launch"/);
 assert.match(handler,/settleLifeLaunch\(email,requestKey,outcome\)/);
});
test("launch SQL is unique, serialized, capped, and handles uncertain as a retained reservation",()=>{
 assert.match(sql,/PRIMARY KEY\(member_key,period_start,request_key\)/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/completed_uses\+w\.reserved_uses>=10/);
 assert.match(sql,/duplicate_/);
 assert.match(sql,/p_outcome='uncertain'/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.life_launch_reserve/);
});

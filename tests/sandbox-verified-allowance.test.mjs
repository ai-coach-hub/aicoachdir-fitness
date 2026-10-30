import test from "node:test";
import assert from "node:assert/strict";
import {resolveSandboxAllowance} from "../lib/sandboxVerifiedAllowance.ts";
const start=1793156154,end=1795834554;
const sub={id:"sub_TEST12345678",customer:"cus_TEST12345678",status:"active",cancel_at_period_end:false,items:{has_more:false,data:[{id:"si_TEST12345678",price:{id:"price_1UVMzH3gZjBKyfbc3h1zn1ZG",recurring:{interval:"month",interval_count:1}},current_period_start:start,current_period_end:end}]}};
const memberKey="member_"+"a".repeat(64);
const wallet={memberKey,entitlementKey:"existing_400_v1",periodStart:new Date(start*1000).toISOString(),periodEnd:new Date(end*1000).toISOString(),limitUses:200,completedUses:90,reservedUses:10};
const args={vercelEnv:"preview",stripeMode:"test",customerId:sub.customer,subscriptionId:sub.id,memberKey,subscription:sub,wallet};
test("test-mode Growth plan resolves exactly 200 shared messages",()=>assert.deepEqual(resolveSandboxAllowance(args),{ok:true,limitUses:200,memberKey,entitlementKey:wallet.entitlementKey,periodStart:wallet.periodStart,periodEnd:wallet.periodEnd}));
test("fails shut if allowance is stale, including grandfathered 400",()=>{
 assert.equal(resolveSandboxAllowance({...args,wallet:{...wallet,limitUses:400}}).ok,false);
 assert.equal(resolveSandboxAllowance({...args,vercelEnv:"production"}).ok,false);
 assert.equal(resolveSandboxAllowance({...args,subscription:{...sub,customer:"cus_OTHER123"}}).ok,false);
 assert.equal(resolveSandboxAllowance({...args,subscription:{...sub,items:{has_more:false,data:[{...sub.items.data[0],price:{id:"price_unknown",recurring:{interval:"month",interval_count:1}}}]}}}).ok,false);
});

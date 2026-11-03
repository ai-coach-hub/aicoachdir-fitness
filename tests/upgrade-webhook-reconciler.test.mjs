import test from "node:test";
import assert from "node:assert/strict";
import {reconcilePaidUpgradeNotification} from "../lib/upgradeWebhookReconciler.ts";
test("unsigned or unrelated event never fetches data or modifies wallet",async()=>{
 let calls=0;
 const shared={eventInvoiceId:"in_12345678",storedIntent:null,
 verifiedMemberKey:"member_"+"a".repeat(64),
 wallet:{memberKey:"member_"+"a".repeat(64),entitlementKey:"existing_400_v1",periodStart:"2026-10-28T00:00:00Z",periodEnd:"2026-11-28T00:00:00Z",limitUses:100,completedUses:90,reservedUses:10},
 fetchStripeInvoice:async()=>{calls++;return null;},
 fetchStripeSubscription:async()=>{calls++;return null;},
 applyWalletIncrease:async()=>{calls++;return "upgraded";}
 };
 assert.deepEqual(await reconcilePaidUpgradeNotification({...shared,eventType:"customer.subscription.updated"}),{ok:false,reason:"unsupported_event"});
 assert.deepEqual(await reconcilePaidUpgradeNotification({...shared,eventType:"invoice.paid"}),{ok:false,reason:"missing_matching_intent"});
 assert.equal(calls,0);
});

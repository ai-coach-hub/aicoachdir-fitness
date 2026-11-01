import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const file=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("four signup tiers have fixed intended price and allowance",()=>{
 const s=file("lib/newTierCatalog.ts");
 for(const [tier,cents,uses] of [["starter",900,100],["growth",1500,200],["premium",2500,400],["elite",3500,600]]){
  assert.match(s,new RegExp('tier: "'+tier+'", cents: '+cents+', messages: '+uses));
 }
 assert.match(s,/LIVE_NEW_TIER_SIGNUPS_ENABLED === "true"/);
 assert.match(s,/price\.livemode !== true/);
 assert.match(s,/stripe account mismatch/i);
});
test("new checkout always checks chosen tier and accepted plan against server-held price map",()=>{
 const api=file("app/api/billing/create-checkout-session/route.ts");
 assert.match(api,/checkedNewTierPrice\(requestedTier, stripeRequest\)/);
 assert.match(api,/currentMembershipTermsId\(email,requestedTier\)/);
 assert.match(api,/metadata\[member_tier\]/);
 assert.match(api,/subscription_data\[metadata\]\[member_tier\]/);
 assert.match(api,/checkCheckoutRisk\(email, storedCustomerId\)/);
});
test("terms acceptance records server-verified plan price and included messages",()=>{
 const route=file("app/api/terms-acceptance/route.ts");
 const terms=file("lib/termsAcceptance.ts");
 assert.match(route,/tierTermsSelection\(input\.tier\)/);
 assert.match(route,/\$\{chosenPlan\}/);
 assert.match(route,/\$\{chosenPrice\}/);
 assert.match(route,/\$\{chosenMessages\}/);
 assert.match(terms,/includedUses:600/);
});
test("paid invoice wallet creation is fail-closed and idempotent",()=>{
 const wallet=file("lib/newTierPaidWallet.ts");
 assert.match(wallet,/signedWebhook/);
 assert.match(wallet,/invoice\.status!=="paid"/);
 assert.match(wallet,/invoice\.amount_remaining!==0/);
 assert.match(wallet,/stripeUsageWindowFromVerifiedRecord/);
 assert.match(wallet,/getFitnessMembershipBySubscriptionId/);
 assert.match(wallet,/sharedUsageMemberKey/);
 assert.match(wallet,/ON CONFLICT DO NOTHING/);
 assert.doesNotMatch(wallet,/UPDATE public\.fitness_memberships/);
});
test("only a signed invoice webhook can settle new tier period allowances",()=>{
 const route=file("app/api/billing/tier-change/webhook/route.ts");
 assert.match(route,/if\(!signed\(/);
 assert.match(route,/settleNewTierPaidInvoice\(obj\.id,true\)/);
 assert.match(route,/PRODUCTION_UPGRADE_WEBHOOK_ENABLED/);
});

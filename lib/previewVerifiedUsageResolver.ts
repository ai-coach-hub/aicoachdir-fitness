// Explicitly private, read-only verified usage decision resolver.
// Never imported by production coaches, checkout or webhooks.
// This binds the tested verified-subscription decision to real isolated
// read adapters but deliberately does not reserve or spend AI uses.
import {checkVerifiedSharedUsage,type TrustedMemberBinding} from "./sharedAiVerifiedUsageBridge";
import {readVerifiedPreviewStripeBilling,readPrivatePriorUsagePeriod} from "./previewVerifiedBillingAdapters";
import type {SharedAiCoach} from "./sharedAiEntitlementPolicy";

export async function resolvePrivateVerifiedUsage(
  member:TrustedMemberBinding,
  args:{authenticatedClerkUserId:string;coach:SharedAiCoach;requestKey:string}
){
 return checkVerifiedSharedUsage(member,{
  authenticatedClerkUserId:args.authenticatedClerkUserId,
  coach:args.coach,
  requestKey:args.requestKey,
  now:new Date().toISOString(),
 },{
  lookupBilling:readVerifiedPreviewStripeBilling,
  lookupPriorPeriod:readPrivatePriorUsagePeriod
 });
}

// PREVIEW PREPARATION ONLY — this has no Stripe, database or provider side effects.
// The owner approved Life Coach for currently eligible $15/400-use members,
// including older subscribers with their original plan/price preserved.
// Caller must supply a server-trusted existing-member binding AND exact price
// IDs approved by the operator. This adapter does NOT establish paid status;
// checkVerifiedSharedUsage must independently verify Stripe + billing period.
import type {TrustedMemberBinding} from "./sharedAiVerifiedUsageBridge";
import type {SharedAiCoach} from "./sharedAiEntitlementPolicy";

export const EXISTING_MEMBER_MONTHLY_AI_USES = 400;
export const EXISTING_MEMBER_COACHES = [
  "fitness", "budgeting", "life"
] as const satisfies readonly SharedAiCoach[];

const isPriceId=(value:unknown):value is string=>
 typeof value==="string" && /^price_[A-Za-z0-9]+$/.test(value);

export function includeLifeForExistingMember(
 binding:TrustedMemberBinding,
 approvedExistingPriceIds:readonly string[]
):TrustedMemberBinding|null {
 // Never grant Life from arbitrary pricing, self-reported plan names, a
 // browser allowance, or a new 400-use wallet for the same paid member.
 if (!Array.isArray(approvedExistingPriceIds) ||
     !approvedExistingPriceIds.length ||
     approvedExistingPriceIds.some(id=>!isPriceId(id)) ||
     !isPriceId(binding.approvedPriceId) ||
     !approvedExistingPriceIds.includes(binding.approvedPriceId) ||
     binding.includedUses!==EXISTING_MEMBER_MONTHLY_AI_USES ||
     !/^[A-Za-z0-9_-]{4,128}$/.test(binding.approvedLedgerKey) ||
     !Array.isArray(binding.allowedCoaches) ||
     !binding.allowedCoaches.includes("fitness") ||
     !binding.allowedCoaches.includes("budgeting") ||
     binding.allowedCoaches.some(coach=>!EXISTING_MEMBER_COACHES.includes(coach as typeof EXISTING_MEMBER_COACHES[number])))
   return null;
 // Preserve the original stable Clerk, Stripe, billing and allowance keys.
 // Only extend the explicit list of included coaches. No additional uses.
 return {...binding,allowedCoaches:EXISTING_MEMBER_COACHES};
}

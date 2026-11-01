import { TERMS_VERSION } from "@/lib/termsMeta";

export { TERMS_VERSION };

export const TERMS_ACCEPTANCE_TEXT =
  "I have read and agree to the Terms & Conditions, including the arbitration agreement, class-action waiver, AI limitations, fitness assumption-of-risk provisions, and automatic-renewal terms. I confirm that I am at least 18 years old.";

export const FITNESS_PLAN = "AI Coach Directory Membership";
export const FITNESS_PRICE = "$15/month";
export const FITNESS_INCLUDED_USES = 400;
export const TERMS_PATH = "/terms";
export const TERMS_SOURCE_PATH = "/fitness/signup";

/** Each new plan's price and included messages are stored with the durable agreement. */
export const TIER_TERMS = {
  starter: {plan:"AI Coach Directory Membership — Starter",price:"$9/month",includedUses:100},
  growth: {plan:"AI Coach Directory Membership — Growth",price:"$15/month",includedUses:200},
  premium: {plan:"AI Coach Directory Membership — Premium",price:"$25/month",includedUses:400},
  elite: {plan:"AI Coach Directory Membership — Elite",price:"$35/month",includedUses:600},
} as const;
export function tierTermsSelection(tier:unknown) {
  return typeof tier==="string" && Object.prototype.hasOwnProperty.call(TIER_TERMS,tier)
    ? TIER_TERMS[tier as keyof typeof TIER_TERMS] : null;
}

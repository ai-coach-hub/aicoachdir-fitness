// Explicitly approved policy as of 2026-10-22: existing $15/month members
// retain 400 total AI uses, shared by Fitness, Budgeting and Life Coach.
// This is a pure entitlement mapping. It grants no access without verified
// paid membership/Stripe checks and does not create additional monthly uses.
import type {SharedAiCoach} from "./sharedAiEntitlementPolicy";
export const LEGACY_400_MONTHLY_LIMIT=400;
export const LEGACY_400_LEDGER_KEY="approved_fitness_v2_legacy";
export const LEGACY_400_COACHES:readonly SharedAiCoach[]=
 Object.freeze(["fitness","budgeting","life"] as const);
export function approvedLegacyLifeEntitlement(){
 return {
  allowanceLedgerKey:LEGACY_400_LEDGER_KEY,
  includedUses:LEGACY_400_MONTHLY_LIMIT,
  allowedCoaches:LEGACY_400_COACHES,
 } as const;
}

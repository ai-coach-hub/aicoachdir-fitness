/**
 * Approved business direction, NOT a live Stripe product catalog.
 * Monthly prices/allowances are targets for test-mode QA only.
 * Live price IDs must be independently verified and explicitly enabled.
 */
export const proposedFourTierPlans = Object.freeze([
 {tier:"starter",label:"Starter",monthlyUsdCents:900,includedMessages:100},
 {tier:"growth",label:"Growth",monthlyUsdCents:1500,includedMessages:200},
 {tier:"premium",label:"Premium",monthlyUsdCents:2500,includedMessages:400},
 {tier:"elite",label:"Elite",monthlyUsdCents:3500,includedMessages:600},
] as const);

export const grandfatheredMembership = Object.freeze({
 legacyMonthlyUsdCents:1500,
 legacyIncludedMessages:400,
 retentionRule:"maintain_original_subscription",
 allLaunchedCoaches:true,
});

export type LegacyPlanAction = "keep"|"switch"|"cancel"|"rejoin";
export type LegacyPlanOutcome = {
 retainLegacyTerms:boolean;
 needsExplicitWarning:boolean;
 preserveSavedWork:true;
};
export function legacyPlanDecision(action:LegacyPlanAction):LegacyPlanOutcome{
 switch(action){
 case "keep":return {retainLegacyTerms:true,needsExplicitWarning:false,preserveSavedWork:true};
 case "switch":return {retainLegacyTerms:false,needsExplicitWarning:true,preserveSavedWork:true};
 case "cancel":return {retainLegacyTerms:false,needsExplicitWarning:true,preserveSavedWork:true};
 case "rejoin":return {retainLegacyTerms:false,needsExplicitWarning:true,preserveSavedWork:true};
 default:throw new Error("Unknown legacy membership transition");
 }
}

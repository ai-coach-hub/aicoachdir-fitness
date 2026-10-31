/**
 * Required independently verified release evidence.
 * Missing or undefined fields must fail closed, not count as success.
 */
export type ReleaseEvidence = {
 authenticatedUpgradeHandlerReady:boolean;
 persistentIntentRoundTripTested:boolean;
 stripeSandboxProrationAndPaymentTested:boolean;
 signedWebhookRetryAndIdempotencyTested:boolean;
 renewalDowngradeScheduleTested:boolean;
 renewalWalletTransitionTested:boolean;
 migrationVerifiedAgainstIsolatedBranch:boolean;
 productionRiskEventsHandled:boolean;
};
const required = [
 "authenticatedUpgradeHandlerReady",
 "persistentIntentRoundTripTested",
 "stripeSandboxProrationAndPaymentTested",
 "signedWebhookRetryAndIdempotencyTested",
 "renewalDowngradeScheduleTested",
 "renewalWalletTransitionTested",
 "migrationVerifiedAgainstIsolatedBranch",
 "productionRiskEventsHandled",
] as const satisfies ReadonlyArray<keyof ReleaseEvidence>;
export function verifyTierTransactionReadiness(v:Partial<ReleaseEvidence>|null|undefined){
 const missing=required.filter(k=>v?.[k]!==true);
 return missing.length===0?{ok:true as const}:{ok:false as const,missing};
}

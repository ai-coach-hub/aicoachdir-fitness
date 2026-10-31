/**
 * Subscription-change integration state. This is not a release approval.
 * We must not equate passing pure policy tests with live payment and renewal QA.
 */
export type ReleaseEvidence = {
  authenticatedUpgradeHandlerReady: boolean;
  persistentIntentRoundTripTested: boolean;
  stripeSandboxProrationAndPaymentTested: boolean;
  signedWebhookRetryAndIdempotencyTested: boolean;
  renewalDowngradeScheduleTested: boolean;
  renewalWalletTransitionTested: boolean;
  migrationVerifiedAgainstIsolatedBranch: boolean;
  productionRiskEventsHandled: boolean;
};
export function verifyTierTransactionReadiness(v:ReleaseEvidence){
 const missing=(Object.keys(v) as (keyof ReleaseEvidence)[]).filter(k=>v[k]!==true);
 return missing.length===0?{ok:true as const}:{ok:false as const,missing};
}

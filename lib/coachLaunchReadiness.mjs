/** Safe, pure launch readiness policy. Does not authorize users or issue credits. */
export function coachLaunchReadiness(facts){
 const needed=["routeReady","providerConfigured","membershipVerified","sharedUsageIntegrated",
  "idempotentRetriesTested","savedHistoryVerified","costPerMessageMeasured",
  "fullUsageMarginApproved","syntheticSmokePassed","ownerApproved"];
 const missing=needed.filter(key=>facts?.[key]!==true);
 return Object.freeze({ready:missing.length===0,missing:Object.freeze(missing)});
}
/** Public exposure must require both catalog registration and all launch gates. */
export function canReleaseNewCoach(catalogEntry,facts){
 return catalogEntry?.availability==="member" &&
  catalogEntry?.releaseGate==="existing" &&
  typeof catalogEntry.href==="string" &&
  coachLaunchReadiness(facts).ready;
}

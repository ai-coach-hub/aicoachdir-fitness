export type CoachLaunchFacts = Readonly<{
  routeReady:boolean; providerConfigured:boolean; membershipVerified:boolean;
  sharedUsageIntegrated:boolean; idempotentRetriesTested:boolean;
  savedHistoryVerified:boolean; costPerMessageMeasured:boolean;
  fullUsageMarginApproved:boolean; syntheticSmokePassed:boolean;
  ownerApproved:boolean;
}>;
export function coachLaunchReadiness(facts:Partial<CoachLaunchFacts>|undefined|null):Readonly<{ready:boolean;missing:readonly string[]}>;
export function canReleaseNewCoach(catalogEntry:{availability:string;releaseGate:string;href:string|null}|null|undefined,facts:Partial<CoachLaunchFacts>):boolean;

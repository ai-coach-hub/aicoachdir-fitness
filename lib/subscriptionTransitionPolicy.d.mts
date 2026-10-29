export declare const TIERS: Readonly<Record<"starter"|"growth"|"premium"|"elite",{readonly monthlyCents:number;readonly monthlyMessages:number}>>;
export declare function planSubscriptionChange(input: {
  verifiedClerkUserId: string;
  linkedClerkUserId: string;
  verifiedCustomerId: string;
  linkedSubscriptionId: string;
  subscription: Record<string, any>;
  targetTier: string;
  otherActiveSubscriptionCount: number;
  approvedPriceIds: Record<string, string | undefined>;
  sharedAllowanceReady: boolean;
}): {ok:false;reason:string} | {ok:true;action:"no_change"|"upgrade"|"downgrade";currentTier:string;targetTier:string;subscriptionId?:string;subscriptionItemId?:string;targetPriceId?:string;requiresBillingPreview?:boolean};

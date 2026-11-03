export declare function buildUpgradePreviewRequest(
 plan: {ok:boolean;action:string;requiresBillingPreview?:boolean;subscriptionId?:string;subscriptionItemId?:string;targetPriceId?:string},
 prorationDate: number
): URLSearchParams;
export declare function summarizeUpgradePreview(invoice: Record<string, any>): Readonly<{
 amountDueCents:number;
 currency:"usd";
 prorationNetCents:number;
 creditCents:number;
 chargeCents:number;
 estimated:true;
}>;

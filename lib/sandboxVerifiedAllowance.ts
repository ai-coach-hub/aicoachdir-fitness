import {sandboxTierCatalogFor} from "./sandboxTierManifest.ts";
import {stripeUsageWindowFromVerifiedRecord} from "./stripeUsagePeriod.ts";

type Rec=Record<string,unknown>;
const obj=(x:unknown):Rec|null=>x&&typeof x==="object"&&!Array.isArray(x)?x as Rec:null;
export type VerifiedPlanWallet={memberKey:string;entitlementKey:string;periodStart:string;periodEnd:string;limitUses:number;completedUses:number;reservedUses:number};
export type ResolvedSandboxAllowance={ok:true;limitUses:number;memberKey:string;entitlementKey:string;periodStart:string;periodEnd:string}|{ok:false;reason:string};
/** Read-only allowance binding, used only on isolated Preview after separate
 * authenticated membership, test-mode Stripe and wallet checks. No inserts.
 * Never trust a browser-supplied limit or silently replace an existing wallet.
 */
export function resolveSandboxAllowance(args:{
 vercelEnv:string|undefined;stripeMode:string;customerId:string;subscriptionId:string;
 memberKey:string;subscription:unknown;wallet:VerifiedPlanWallet|null
}):ResolvedSandboxAllowance{
 const deny=(reason:string):ResolvedSandboxAllowance=>({ok:false,reason});
 if(args.vercelEnv!=="preview"||args.stripeMode!=="test")return deny("test_only");
 const cat=sandboxTierCatalogFor(args.vercelEnv,args.stripeMode);
 if(!cat.ok)return deny("catalog_unavailable");
 const sub=obj(args.subscription);
 if(!sub||sub.customer!==args.customerId||sub.id!==args.subscriptionId||
 !["active","trialing"].includes(String(sub.status||""))||
 sub.cancel_at_period_end===true||sub.pending_update)return deny("subscription_not_verified");
 const items=obj(sub.items),rows=items?.data;
 if(!Array.isArray(rows)||rows.length!==1||items?.has_more===true)return deny("ambiguous_items");
 const price=obj(obj(rows[0])?.price),priceId=String(price?.id||"");
 const approved=cat.catalog.find(x=>x.stripePriceId===priceId);
 if(!approved)return deny("unapproved_price");
 const window=stripeUsageWindowFromVerifiedRecord(sub,{customerId:args.customerId,subscriptionId:args.subscriptionId,priceId});
 if(!window.ok)return deny("invalid_period");
 const w=args.wallet;
 if(!w||w.memberKey!==args.memberKey||
 !/^member_[0-9a-f]{64}$/.test(w.memberKey)||
 !/^[A-Za-z0-9_-]{4,128}$/.test(w.entitlementKey)||
 w.periodStart!==window.periodStart||w.periodEnd!==window.periodEnd)return deny("wallet_mismatch");
 if(![w.limitUses,w.completedUses,w.reservedUses].every(n=>Number.isSafeInteger(n)&&n>=0)||
 w.limitUses!==approved.includedMessages||
 w.completedUses+w.reservedUses>w.limitUses)return deny("allowance_unreconciled");
 return {ok:true,memberKey:w.memberKey,entitlementKey:w.entitlementKey,periodStart:w.periodStart,periodEnd:w.periodEnd,limitUses:w.limitUses};
}

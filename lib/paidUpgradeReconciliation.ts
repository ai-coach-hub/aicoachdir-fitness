import {verifyWalletIncrease, type WalletBefore, type VerifiedPaidPlanChange} from "./upgradeWalletTransition.ts";
import {stripeUsageWindowFromVerifiedRecord} from "./stripeUsagePeriod.ts";

/**
 * Used ONLY after loading an operator-created durable upgrade intent by its
 * exact subscription ID from the database. The signed Stripe webhook is a
 * notification; live invoice and subscription are independently re-fetched.
 * Never derive a member key or target allowance from webhook metadata.
 */
type Obj=Record<string,unknown>;
const object=(v:unknown):Obj|null=>v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Obj:null;
const str=(v:unknown)=>typeof v==="string"?v:"";
export type PaidUpgradeReceipt={
 invoiceId:string;customerId:string;subscriptionId:string;subscriptionItemId:string;
 oldPriceId:string;targetPriceId:string;targetLimitUses:number;
};
export type UpgradeApplyResult={ok:true;status:"upgraded"|"already_applied"}|{ok:false;reason:string};
export async function applyVerifiedPaidUpgrade(args:{
 receipt:PaidUpgradeReceipt;
 stripeInvoice:unknown;
 stripeSubscription:unknown;
 wallet:WalletBefore;
 expectedMemberKey:string;
 applyAtomicWalletIncrease:(expectedLimit:number,newLimit:number)=>Promise<string>;
}):Promise<UpgradeApplyResult>{
 const deny=(reason:string):UpgradeApplyResult=>({ok:false,reason});
 const {receipt:r,expectedMemberKey,wallet}=args;
 if(!r||!/^in_[A-Za-z0-9]+$/.test(r.invoiceId)||
 !/^cus_[A-Za-z0-9]+$/.test(r.customerId)||
 !/^sub_[A-Za-z0-9]+$/.test(r.subscriptionId)||
 !/^si_[A-Za-z0-9]+$/.test(r.subscriptionItemId)||
 !/^price_[A-Za-z0-9]+$/.test(r.oldPriceId)||
 !/^price_[A-Za-z0-9]+$/.test(r.targetPriceId)||
 r.targetPriceId===r.oldPriceId||wallet.memberKey!==expectedMemberKey)
 return deny("unverified_upgrade_binding");

 const invoice=object(args.stripeInvoice),sub=object(args.stripeSubscription);
 const parent=object(invoice?.parent),details=object(parent?.subscription_details);
 // Stripe's modern invoice schema exposes its subscription under parent,
 // while older pinned versions expose a top-level invoice.subscription.
 const billedSub=str(invoice?.subscription)||str(details?.subscription);
 if(!invoice||invoice.id!==r.invoiceId||invoice.customer!==r.customerId||
 billedSub!==r.subscriptionId||invoice.status!=="paid"||
 invoice.paid===false||invoice.currency!=="usd"||
 invoice.billing_reason!=="subscription_update"||
 !Number.isSafeInteger(invoice.amount_paid)||Number(invoice.amount_paid)<=0)
 return deny("upgrade_invoice_unpaid_or_unbound");

 if(!sub||sub.id!==r.subscriptionId||sub.customer!==r.customerId||
 !["active","trialing"].includes(str(sub.status))||sub.pending_update)
 return deny("subscription_not_active");
 const items=object(sub.items),data=items?.data;
 if(items?.has_more===true||!Array.isArray(data)||data.length!==1||
 object(data[0])?.id!==r.subscriptionItemId||
 object(object(data[0])?.price)?.id!==r.targetPriceId)
 return deny("subscription_price_not_confirmed");

 const currentPeriod=stripeUsageWindowFromVerifiedRecord(sub,{
 customerId:r.customerId,subscriptionId:r.subscriptionId,priceId:r.targetPriceId
 });
 if(!currentPeriod.ok||currentPeriod.periodStart!==wallet.periodStart||
 currentPeriod.periodEnd!==wallet.periodEnd)
 return deny("billing_period_changed");

 // An upgrade invoice must contain the actual proration credit/debit for
 // this same subscription item. Reject ambiguous invoices rather than infer
 // a positive amount is the member's approved plan upgrade.
 const lines=object(invoice.lines),rows=lines?.data;
 if(!Array.isArray(rows)||lines?.has_more===true||rows.length!==2)
 return deny("upgrade_invoice_lines_ambiguous");
 let oldCredit=0,newCharge=0;
 for(const raw of rows){
  const line=object(raw),pricing=object(object(line?.pricing)?.price_details);
  const parentLine=object(line?.parent),detailLine=object(parentLine?.subscription_item_details);
  const period=object(line?.period);
  if(!line||!detailLine||detailLine.proration!==true||
   detailLine.subscription!==r.subscriptionId||
   detailLine.subscription_item!==r.subscriptionItemId||
   !period||Number(period.end)*1000!==Date.parse(wallet.periodEnd)||
   typeof line.amount!=="number"||!Number.isSafeInteger(line.amount))
   return deny("upgrade_invoice_lines_unverified");
  if(pricing?.price===r.oldPriceId&&Number(line.amount)<0)oldCredit++;
  else if(pricing?.price===r.targetPriceId&&Number(line.amount)>0)newCharge++;
  else return deny("upgrade_invoice_line_price_mismatch");
 }
 if(oldCredit!==1||newCharge!==1)return deny("upgrade_invoice_lines_ambiguous");

 const change:VerifiedPaidPlanChange={
 sameMemberKey:expectedMemberKey,samePeriodStart:currentPeriod.periodStart,
 samePeriodEnd:currentPeriod.periodEnd,oldPriceId:r.oldPriceId,
 newPriceId:r.targetPriceId,targetLimitUses:r.targetLimitUses,
 stripeInvoicePaid:true,stripeSubscriptionActive:true
 };
 const decision=verifyWalletIncrease(wallet,change);
 if(!decision.ok)return deny(decision.reason);
 const outcome=await args.applyAtomicWalletIncrease(wallet.limitUses,decision.nextLimitUses);
 if(outcome==="upgraded")return {ok:true,status:"upgraded"};
 if(outcome==="already_applied")return {ok:true,status:"already_applied"};
 if(outcome==="stale_or_already_changed")return deny("wallet_refresh_required");
 return deny("wallet_atomic_update_failed");
}

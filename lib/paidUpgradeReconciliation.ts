import {verifyWalletIncrease, type WalletBefore, type VerifiedPaidPlanChange} from "./upgradeWalletTransition.ts";

/**
 * Server-only payment-to-wallet reconciliation.
 * This is not exposed through HTTP. Callers must resolve the member from a
 * stored, verified Stripe subscription binding, NOT webhook metadata/email.
 * The paid invoice must reference the same subscription and customer, and
 * its paid amount must be positive for an immediate upgrade.
 */
type Obj=Record<string,unknown>;
const object=(v:unknown):Obj|null=>v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Obj:null;
export type PaidUpgradeReceipt={
 invoiceId:string; customerId:string; subscriptionId:string;
 oldPriceId:string; targetPriceId:string; targetLimitUses:number;
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
 !/^price_[A-Za-z0-9]+$/.test(r.oldPriceId)||
 !/^price_[A-Za-z0-9]+$/.test(r.targetPriceId)||
 r.targetPriceId===r.oldPriceId||wallet.memberKey!==expectedMemberKey)
 return deny("unverified_upgrade_binding");
 const invoice=object(args.stripeInvoice),sub=object(args.stripeSubscription);
 if(!invoice||invoice.id!==r.invoiceId||invoice.customer!==r.customerId||
 invoice.subscription!==r.subscriptionId||invoice.status!=="paid"||
 invoice.paid!==true||!Number.isSafeInteger(invoice.amount_paid)||
 Number(invoice.amount_paid)<=0)return deny("upgrade_invoice_unpaid_or_unbound");
 if(!sub||sub.id!==r.subscriptionId||sub.customer!==r.customerId||
 !["active","trialing"].includes(String(sub.status||"")))return deny("subscription_not_active");
 const items=object(sub.items); const data=items?.data;
 if(items?.has_more===true||!Array.isArray(data)||data.length!==1||
 object(object(data[0])?.price)?.id!==r.targetPriceId)
 return deny("subscription_price_not_confirmed");
 const change:VerifiedPaidPlanChange={
 sameMemberKey:expectedMemberKey,samePeriodStart:wallet.periodStart,
 samePeriodEnd:wallet.periodEnd,oldPriceId:r.oldPriceId,
 newPriceId:r.targetPriceId,targetLimitUses:r.targetLimitUses,
 stripeInvoicePaid:true,stripeSubscriptionActive:true
 };
 const decision=verifyWalletIncrease(wallet,change);
 if(!decision.ok)return deny(decision.reason);
 const outcome=await args.applyAtomicWalletIncrease(wallet.limitUses,decision.nextLimitUses);
 if(outcome==="upgraded")return {ok:true,status:"upgraded"};
 if(outcome==="stale_or_already_changed")return deny("wallet_refresh_required");
 return deny("wallet_atomic_update_failed");
}

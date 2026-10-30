import {applyVerifiedPaidUpgrade,type PaidUpgradeReceipt} from "./paidUpgradeReconciliation.ts";
import type {WalletBefore} from "./upgradeWalletTransition.ts";

/** Server-only adapter. A signed Stripe event is a notification, not authority.
 * The durable intent must have been saved by a Clerk-authenticated existing
 * subscriber before an in-place Stripe change. Never trust event metadata
 * for member or message grants. Integration is deliberately disabled until
 * a verified intent store and test-only webhook endpoint exist.
 */
export async function reconcilePaidUpgradeNotification(args:{
 eventType:string; eventInvoiceId:string; storedIntent:PaidUpgradeReceipt|null;
 verifiedMemberKey:string; wallet:WalletBefore;
 fetchStripeInvoice:(id:string)=>Promise<unknown>;
 fetchStripeSubscription:(id:string)=>Promise<unknown>;
 applyWalletIncrease:(expected:number,target:number)=>Promise<string>;
}){
 if(args.eventType!=="invoice.paid"&&args.eventType!=="invoice.payment_succeeded")
  return {ok:false as const,reason:"unsupported_event"};
 if(!args.storedIntent||args.eventInvoiceId!==args.storedIntent.invoiceId)
  return {ok:false as const,reason:"missing_matching_intent"};
 const [invoice,subscription]=await Promise.all([
  args.fetchStripeInvoice(args.storedIntent.invoiceId),
  args.fetchStripeSubscription(args.storedIntent.subscriptionId)
 ]);
 return applyVerifiedPaidUpgrade({receipt:args.storedIntent,
  stripeInvoice:invoice,stripeSubscription:subscription,
  wallet:args.wallet,expectedMemberKey:args.verifiedMemberKey,
  applyAtomicWalletIncrease:args.applyWalletIncrease});
}

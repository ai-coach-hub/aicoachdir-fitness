/**
 * Resolve the next wallet allowance from an independently verified Stripe
 * price, without accepting any limit from the client or webhook payload.
 * Legacy subscription price IDs remain 400 only if explicitly grandfathered.
 */
import {type CatalogPrice} from "./verifiedTierCatalog.ts";
export type ResolvedAllowance={ok:true;limitUses:number;entitlementKey:string;plan:"legacy"|"starter"|"growth"|"premium"|"elite"}|{ok:false;reason:string};
export function resolveVerifiedWalletAllowance(args:{
 verifiedStripePriceId:string;
 verifiedLegacyPriceIds:readonly string[];
 verifiedCatalog:readonly CatalogPrice[];
 priorWallet?:{entitlementKey:string;limitUses:number}|null;
}):ResolvedAllowance{
 const {verifiedStripePriceId:price,verifiedLegacyPriceIds:legacy,verifiedCatalog:catalog,priorWallet}=args;
 if(!/^price_[A-Za-z0-9]+$/.test(price))return {ok:false,reason:"unverified_price"};
 if(!Array.isArray(legacy)||!Array.isArray(catalog)||
 legacy.some(x=>!/^price_[A-Za-z0-9]+$/.test(x))||
 catalog.some(p=>!/^price_[A-Za-z0-9]+$/.test(p.stripePriceId)||
 !Number.isSafeInteger(p.includedMessages)||p.includedMessages<1||p.includedMessages>10000))
 return {ok:false,reason:"invalid_catalog"};
 const approvedLegacy=legacy.includes(price);
 const tier=catalog.filter(p=>p.stripePriceId===price);
 if(tier.length>1||(approvedLegacy&&tier.length))return {ok:false,reason:"ambiguous_price"};
 if(!approvedLegacy&&tier.length!==1)return {ok:false,reason:"unknown_price"};
 const limit=approvedLegacy?400:tier[0].includedMessages;
 const key=priorWallet?.entitlementKey||"existing_400_v1";
 // Already established wallets must keep their original period and identity.
 // The SQL compare-and-swap upgrade function is responsible for increasing
 // their cap after payment; never infer that a Stripe price grants more usage.
 if(priorWallet&&priorWallet.limitUses!==limit)
 return {ok:false,reason:"wallet_payment_reconciliation_required"};
 return {ok:true,limitUses:limit,entitlementKey:key,plan:approvedLegacy?"legacy":tier[0].tier};
}

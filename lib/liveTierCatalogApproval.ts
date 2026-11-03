import {proposedFourTierPlans} from "./fourTierPricingPolicy";
export type LiveTier={tier:"starter"|"growth"|"premium"|"elite";monthlyUsdCents:number;includedMessages:number;stripePriceId:string};
const id=(value:string)=>/^price_[A-Za-z0-9]+$/.test(value);
/** Fail closed: no automatic adoption of existing live Stripe prices by amount alone.
 * Prices require exact operator approval and Stripe-server verification. */
export function validateLiveTierCatalog(config:Record<string,string|undefined>,verifiedStripePrices:Record<string,{active:boolean;livemode:boolean;currency:string;unitAmount:number;interval:string;intervalCount:number;productId:string}>){
 const names=["starter","growth","premium","elite"] as const;
 const out:LiveTier[]=[];
 const seen=new Set<string>();
 for(const tier of names){
  const row=proposedFourTierPlans.find(x=>x.tier===tier)!;
  const priceId=String(config["LIVE_TIER_"+tier.toUpperCase()+"_PRICE_ID"]||"");
  if(!id(priceId)||seen.has(priceId))return {ok:false as const,reason:"unapproved_price:"+tier};
  const verified=verifiedStripePrices[priceId];
  if(!verified||!verified.active||!verified.livemode||verified.currency!=="usd"||
   verified.unitAmount!==row.monthlyUsdCents||verified.interval!=="month"||
   verified.intervalCount!==1||!/^prod_[A-Za-z0-9]+$/.test(verified.productId))
   return {ok:false as const,reason:"unverified_price:"+tier};
  seen.add(priceId);
  out.push({...row,stripePriceId:priceId});
 }
 return {ok:true as const,catalog:out};
}

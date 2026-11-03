import {proposedFourTierPlans} from "./fourTierPricingPolicy.ts";

export type CatalogPrice = {
 tier:"starter"|"growth"|"premium"|"elite";
 stripePriceId:string;
 monthlyUsdCents:number;
 includedMessages:number;
};
export type CatalogResult =
 | {ok:true;catalog:readonly CatalogPrice[]}
 | {ok:false;reason:string};

/**
 * Resolve a four-price catalog ONLY from explicit, operator-reviewed Stripe IDs.
 * Never guess IDs from names, existing legacy products or amount alone.
 * No production price activation until separate release gates are satisfied.
 */
export function verifiedTierCatalog(config:unknown, env:"test"|"live"):CatalogResult {
 if(!config || typeof config!=="object" || Array.isArray(config))
  return {ok:false,reason:"missing_catalog"};
 const raw=config as Record<string,unknown>;
 if(raw.environment!==env || !Array.isArray(raw.prices)||raw.prices.length!==4)
  return {ok:false,reason:"environment_or_count_mismatch"};
 const ids=new Set<string>();
 const catalog:CatalogPrice[]=[];
 for(const expected of proposedFourTierPlans){
  const items=raw.prices.filter((x:unknown)=>x&&typeof x==="object"&&
    (x as Record<string,unknown>).tier===expected.tier);
  if(items.length!==1)return {ok:false,reason:"missing_or_duplicate_tier"};
  const item=items[0] as Record<string,unknown>;
  if(typeof item.stripePriceId!=="string"||
    !/^price_[A-Za-z0-9]+$/.test(item.stripePriceId)||
    ids.has(item.stripePriceId)||
    item.monthlyUsdCents!==expected.monthlyUsdCents||
    item.includedMessages!==expected.includedMessages||
    item.currency!=="usd" || item.interval!=="month"||
    item.active!==true)
   return {ok:false,reason:"unapproved_tier_price"};
  ids.add(item.stripePriceId);
  catalog.push({tier:expected.tier,stripePriceId:item.stripePriceId,
    monthlyUsdCents:expected.monthlyUsdCents,includedMessages:expected.includedMessages});
 }
 return {ok:true,catalog};
}

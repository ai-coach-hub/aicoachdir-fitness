// One authoritative approval set for the existing $15/400 subscription.
// The current live price comes from the pre-existing production billing_config,
// not a new checkout, product creation or a browser-supplied plan claim.
// Older prices may be explicitly grandfathered by the operator.
export function approvedSharedPriceIds(args:{
 environment:string;
 billingCurrentPrice:unknown;
 extraApprovedPrices:string;
}):string[]{
 const valid=(x:unknown):x is string=>typeof x==="string"&&/^price_[A-Za-z0-9]+$/.test(x);
 const extra=String(args.extraApprovedPrices||"").trim();
 const additions=extra?extra.split(",").map(v=>v.trim()):[];
 if(additions.some(x=>!valid(x)))return [];
 if(args.environment==="production"){
  if(!valid(args.billingCurrentPrice))return [];
  return [...new Set([args.billingCurrentPrice,...additions])];
 }
 if(args.environment==="preview")return [...new Set(additions)];
 return [];
}

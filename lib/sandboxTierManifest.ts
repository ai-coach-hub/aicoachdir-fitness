/**
 * Existing approved sandbox-only products, verified using the linked Stripe
 * Testing account. These are NOT prices for live checkout. This catalog is
 * unusable outside a separate test-mode Stripe environment.
 */
import {verifiedTierCatalog} from "./verifiedTierCatalog.ts";
export const sandboxTierManifest = Object.freeze({
 environment:"test",
 prices:[
  {tier:"starter",stripePriceId:"price_1UVMyx3gZjBKyfbcqKDNhdyJ",monthlyUsdCents:900,includedMessages:100,currency:"usd",interval:"month",active:true},
  {tier:"growth",stripePriceId:"price_1UVMzH3gZjBKyfbc3h1zn1ZG",monthlyUsdCents:1500,includedMessages:200,currency:"usd",interval:"month",active:true},
  {tier:"premium",stripePriceId:"price_1UVMzJ3gZjBKyfbcoYRB0IAT",monthlyUsdCents:2500,includedMessages:400,currency:"usd",interval:"month",active:true},
  {tier:"elite",stripePriceId:"price_1UVMzK3gZjBK yfbcyqU6Gedp",monthlyUsdCents:3500,includedMessages:600,currency:"usd",interval:"month",active:true},
 ]
});
export function sandboxTierCatalogFor(ve:string|undefined,mode:string){
 if(ve!=="preview"||mode!=="test")return {ok:false as const,reason:"test_only"};
 return verifiedTierCatalog(sandboxTierManifest,"test");
}

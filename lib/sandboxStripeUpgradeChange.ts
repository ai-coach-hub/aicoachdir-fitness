/**
 * Stripe subscription updates for the isolated upgrade preview. Caller must
 * already have a verified, durable intent and must explicitly confirm the
 * preview. This helper makes no network request and cannot grant messages.
 */
export type UpgradeStripeChange={
 subscriptionId:string;itemId:string;targetPriceId:string;intentId:string;
};
const id=(s:string,p:string)=>new RegExp("^"+p+"_[A-Za-z0-9]+$").test(s);
export function buildSandboxStripeUpgradeChange(
 input:UpgradeStripeChange,
 env:{vercelEnv:string|undefined;branch:string|undefined;mode:string;enabled:string|undefined},
):{ok:true;path:string;body:URLSearchParams;idempotencyKey:string}|{ok:false;reason:string}{
 if(env.vercelEnv!=="preview"||
 env.branch!=="feature/verified-subscription-upgrade-policy-20261027"||
 env.mode!=="test"||env.enabled!=="true")
  return {ok:false,reason:"sandbox_only"};
 if(!id(input.subscriptionId,"sub")||!id(input.itemId,"si")||
 !id(input.targetPriceId,"price")||
 !/^upg_[a-f0-9]{36}$/.test(input.intentId))
  return {ok:false,reason:"invalid_intent"};
 const body=new URLSearchParams();
 body.set("items[0][id]",input.itemId);
 body.set("items[0][price]",input.targetPriceId);
 body.set("payment_behavior","pending_if_incomplete");
 body.set("proration_behavior","always_invoice");
 body.set("billing_cycle_anchor","unchanged");
 return {ok:true,path:"/subscriptions/"+encodeURIComponent(input.subscriptionId),
  body,idempotencyKey:"aicoachdir-sandbox-upgrade-"+input.intentId};
}

type Obj=Record<string,unknown>;
const obj=(v:unknown):Obj|null=>v&&typeof v==="object"&&!Array.isArray(v)?v as Obj:null;
export function verifySandboxUpgradeQuote(args:{
 preview:unknown;customerId:string;subscriptionId:string;subscriptionItemId:string;
 oldPriceId:string;newPriceId:string;periodEnd:string
}):{ok:true;amountCents:number}|{ok:false;reason:string}{
 const deny=(reason:string)=>({ok:false as const,reason});
 const inv=obj(args.preview),lines=obj(inv?.lines),data=lines?.data;
 if(!inv||inv.currency!=="usd"||!Number.isSafeInteger(inv.amount_due)||
 Number(inv.amount_due)<=0||Number(inv.amount_due)>20000||
 !Array.isArray(data)||data.length!==2||lines?.has_more===true)
 return deny("invalid_invoice_preview");
 if(inv.customer && inv.customer!==args.customerId)return deny("quote_wrong_customer");
 let credit=0,charge=0,total=0;
 for(const raw of data){
  const line=obj(raw),parent=obj(line?.parent),details=obj(parent?.subscription_item_details);
  const price=obj(obj(line?.pricing)?.price_details),period=obj(line?.period);
  if(!line||!details||details.proration!==true||
    details.subscription!==args.subscriptionId||
    details.subscription_item!==args.subscriptionItemId||
    !period||Number(period.end)*1000!==Date.parse(args.periodEnd)||
    !Number.isSafeInteger(line.amount))return deny("quote_not_bound_to_item");
  const amount=Number(line.amount);
  total+=amount;
  if(price?.price===args.oldPriceId&&amount<0)credit++;
  else if(price?.price===args.newPriceId&&amount>0)charge++;
  else return deny("unapproved_proration");
 }
 if(credit!==1||charge!==1||total!==Number(inv.amount_due))
 return deny("ambiguous_quote");
 return {ok:true,amountCents:total};
}

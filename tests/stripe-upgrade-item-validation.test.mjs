import test from "node:test";
import assert from "node:assert/strict";
import {validateStripeUpgradeItem} from "../lib/stripeUpgradeItemValidation.ts";
const item={id:"si_12345678",price:{id:"price_OLD123",currency:"usd",recurring:{interval:"month",interval_count:1}}};
const sub={id:"sub_12345678",customer:"cus_12345678",status:"active",items:{has_more:false,data:[item]}};
const expected={subscriptionId:sub.id,customerId:sub.customer,currentPriceId:item.price.id};
const target={tier:"premium",stripePriceId:"price_NEW456",monthlyUsdCents:2500,includedMessages:400};
test("only one exact monthly subscription item can be selected for in-place upgrade",()=>{
 assert.deepEqual(validateStripeUpgradeItem(sub,expected,target),{ok:true,subscriptionId:sub.id,customerId:sub.customer,itemId:item.id,currentPriceId:item.price.id,targetPriceId:target.stripePriceId});
});
test("reject other customer, other price, other item, extra items or inactive subscription",()=>{
 for(const s of [{...sub,customer:"cus_another123"},{...sub,status:"past_due"},
 {...sub,items:{data:[item,item]}},
 {...sub,items:{data:[{...item,id:"invalid"}]}},
 {...sub,items:{data:[{...item,price:{...item.price,currency:"eur"}}]}},
 {...sub,items:{data:[{...item,price:{...item.price,recurring:{interval:"year",interval_count:1}}}]}}])
 assert.equal(validateStripeUpgradeItem(s,expected,target).ok,false);
 assert.equal(validateStripeUpgradeItem(sub,expected,{...target,stripePriceId:item.price.id}).ok,false);
});

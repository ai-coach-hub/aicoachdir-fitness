// Draft-only subscription transition policy. No Stripe or Pickaxe calls.
export function planSwitchDecision({currentRank,targetRank,subscriptionActive,alreadyScheduled=false}){
  if(!Number.isInteger(currentRank)||!Number.isInteger(targetRank)||
    currentRank<0||targetRank<0||currentRank>3||targetRank>3||
    subscriptionActive!==true) return {kind:"blocked"};
  if(currentRank===targetRank) return {kind:"unchanged"};
  if(alreadyScheduled) return {kind:"review-pending-change"};
  return targetRank>currentRank
    ? {kind:"upgrade",effective:"after-confirmed-payment",preserveSubscription:true}
    : {kind:"downgrade",effective:"next-paid-renewal",preserveSubscription:true};
}
export function safeUsageAtChange({used,reserved,currentLimit,targetLimit,paidUpgradeConfirmed,renewalReached}){
  if(![used,reserved,currentLimit,targetLimit].every(x=>Number.isInteger(x)&&x>=0)||
    used+reserved>currentLimit||targetLimit<1)return null;
  if(renewalReached===true)return {limit:targetLimit,used:0,reserved:0};
  if(targetLimit<currentLimit) return {limit:currentLimit,used,reserved,pendingLimit:targetLimit};
  if(targetLimit>currentLimit && paidUpgradeConfirmed!==true)return {limit:currentLimit,used,reserved,pendingPayment:true};
  return {limit:targetLimit,used,reserved};
}

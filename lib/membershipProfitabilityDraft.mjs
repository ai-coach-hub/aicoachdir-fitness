/**
 * Pure, draft-only unit economics gate. No external APIs, pricing changes, or charges.
 * Numbers are supplied by operator after real observed cost reconciliation.
 */
export function modelFullUtilization({priceUsd,monthlyUses,unitCostUsd,paymentFixedUsd,paymentRate,monthlyOverheadUsd=0}){
  const nums=[priceUsd,monthlyUses,unitCostUsd,paymentFixedUsd,paymentRate,monthlyOverheadUsd];
  if(nums.some(n=>!Number.isFinite(n)||n<0)||monthlyUses<=0||!Number.isInteger(monthlyUses)||paymentRate>=1)return null;
  const fees=paymentFixedUsd+priceUsd*paymentRate;
  const inference=monthlyUses*unitCostUsd;
  const totalCost=fees+inference+monthlyOverheadUsd;
  const profit=priceUsd-totalCost;
  return {revenueUsd:priceUsd,aiCostUsd:inference,processingUsd:fees,overheadUsd:monthlyOverheadUsd,
    contributionUsd:profit,margin:priceUsd>0?profit/priceUsd:-Infinity,breakEvenUnitCostUsd:(priceUsd-fees-monthlyOverheadUsd)/monthlyUses};
}
export function meetsFullUtilizationMargin(plan, costs, targetMargin=0.30){
  if(!Number.isFinite(targetMargin)||targetMargin<0||targetMargin>=1)return false;
  const result=modelFullUtilization({...costs,priceUsd:plan.proposedUsd,monthlyUses:plan.proposedUses});
  return result!==null && result.contributionUsd>=0 && result.margin>=targetMargin;
}

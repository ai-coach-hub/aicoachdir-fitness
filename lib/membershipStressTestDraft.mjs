/** Draft stress-tested candidates ONLY. Not imported by production routes.
 * $0.10 per customer-visible message is a modelling assumption, NOT an observed
 * price or a verified ceiling (one message may cause multiple backend runs).
 */
import {modelFullUtilization} from "./membershipProfitabilityDraft.mjs";
export const COST_SAFETY_DRAFT = Object.freeze({
  unitCostUsd:0.10, processingRate:0.029, processingFixedUsd:0.30,
  monthlyOverheadUsd:1, marginFloor:0.30,
});
export const STRESS_TEST_CANDIDATES = Object.freeze([
  Object.freeze({key:"starter",label:"Starter",monthlyUsd:9,monthlyMessages:40}),
  Object.freeze({key:"growth",label:"Growth",monthlyUsd:15,monthlyMessages:80}),
  Object.freeze({key:"premium",label:"Premium",monthlyUsd:25,monthlyMessages:140}),
  Object.freeze({key:"elite",label:"Elite",monthlyUsd:39,monthlyMessages:220}),
]);
export function evaluateStressTest(candidates=STRESS_TEST_CANDIDATES,costs=COST_SAFETY_DRAFT){
 if(!Array.isArray(candidates)||candidates.length!==4)return null;
 const results=candidates.map(t=>{
  const model=modelFullUtilization({
   priceUsd:t.monthlyUsd,monthlyUses:t.monthlyMessages,
   unitCostUsd:costs.unitCostUsd,paymentFixedUsd:costs.processingFixedUsd,
   paymentRate:costs.processingRate,monthlyOverheadUsd:costs.monthlyOverheadUsd,
  });
  return model?{...t,...model,passes:model.margin>=costs.marginFloor}:null;
 });
 return results.every(Boolean)?results:null;
}

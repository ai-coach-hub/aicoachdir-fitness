/**
 * Until the native Fitness workout, Budgeting tracker and Life goal stores
 * have verified trial entitlements, never let a text-only completion claim
 * a change was saved. This check runs BEFORE reserving any of the 15 turns.
 * It protects customer data, but does not constitute native tool parity.
 */
export type TrialCoach="fitness"|"budgeting"|"life";
export function nativeTrialWriteRequested(coach:TrialCoach,raw:string):boolean{
 const message=String(raw||"").trim().toLowerCase()
   .replace(/^(?:(?:please|hey|hi|hello)[,!.]?\s*)+/,"")
   .replace(/^(?:can|could|would|will) you (?:please )?/,"")
   .replace(/^(?:i (?:want|need) you to |i(?:'d| would) like you to )/,"");
 if(/^how (?:do|can|would|should) (?:i|we)\b/.test(message))return false;
 if(coach==="fitness"){
  return /^(?:save|store|record|update|modify|change|edit|delete|remove|schedule|reschedule|complete|mark|log)\b.{0,80}\b(?:workouts?|workout plans?|plans?|exercise logs?|schedules?|routines?)\b/.test(message)
   || /^(?:mark|log|record)\s+(?:today'?s?\s+)?(?:workout|class|exercise)\s+(?:as\s+)?(?:done|complete|completed)\b/.test(message);
 }
 if(coach==="budgeting"){
  return /^(?:save|store|record|update|modify|change|edit|delete|remove|copy|duplicate|rollover|roll over)\b.{0,80}\b(?:budgets?|expenses?|transactions?|categories|income|planned amounts?|rollovers?)\b/.test(message)
   || /^(?:add|log|record|track|enter|subtract)\s+(?:an?\s+)?(?:\$\s*\d|\d+(?:\.\d+)?\s+(?:dollars?|usd))\b/.test(message)
   || /^(?:add|log|record|track|enter|delete|remove)\b.{0,75}\b(?:expenses?|transactions?|purchases?|income)\b/.test(message);
 }
 return /^(?:remember|save|store|track|record|set|update|change|delete|remove)\b.{0,80}\b(?:goals?|habits?|priorities|commitments?)\b/.test(message)
  || /\bplease remember\b.{0,90}\b(?:goal|habit|priority)\b/.test(message);
}
export function nativeTrialWriteExplanation(coach:TrialCoach):string{
 const item=coach==="fitness"?"saved workouts and workout tracking":
  coach==="budgeting"?"saved budgets and expenses":"saved goals and habits";
 return "I can help you think this through, but "+item+
  " are not connected to this introductory chat yet. No changes were saved and no trial message was used. Your regular paid coach tools are unchanged.";
}

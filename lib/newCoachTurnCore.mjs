/**
 * Future coach orchestration contract. Does not run for any existing coach or
 * enable unreleased Career. Authorization must happen BEFORE this function.
 * Storage is caller-owned and coach-scoped. No conversation content is logged.
 */
export function summarizeProviderCalls(calls) {
 if (!Array.isArray(calls)) return null;
 let cost=0, allCostsKnown=true, input=0, output=0, allTokensKnown=true;
 for (const c of calls) {
  if (!c || !Number.isInteger(c.attempts) || c.attempts<1 || c.attempts>20 ||
      (c.costUsd!==null && (typeof c.costUsd!=="number" || !Number.isFinite(c.costUsd) || c.costUsd<0))) return null;
  if (c.costUsd===null) allCostsKnown=false; else cost+=c.costUsd;
  if (!Number.isSafeInteger(c.inputTokens) || c.inputTokens<0 ||
      !Number.isSafeInteger(c.outputTokens) || c.outputTokens<0) allTokensKnown=false;
  else {input+=c.inputTokens;output+=c.outputTokens;}
 }
 return Object.freeze({
  providerCalls:calls.reduce((n,c)=>n+c.attempts,0),
  costUsd:allCostsKnown && calls.length?Number(cost.toFixed(8)):null,
  inputTokens:allTokensKnown&&calls.length?input:null,
  outputTokens:allTokensKnown&&calls.length?output:null,
 });
}
export async function runNewCoachTurn({authorize,reserve,settle,generate,saveTurn,observe}) {
 if (![authorize,reserve,settle,generate,saveTurn].every(x=>typeof x==="function"))throw Error("Missing trusted server ports");
 const identity=await authorize();
 if (!identity?.ok) return {status:"blocked",reason:"not_authorized"};
 const status=await reserve(identity);
 if (status!=="reserved")return {status:"blocked",reason:status};
 let initiated=false;
 try {
  initiated=true;
  const result=await generate(identity);
  if(result?.kind==="no-model"){
   const out=await settle("released",identity);
   return out==="released"||out==="already_released"?{status:"no-model"}:{status:"uncertain"};
  }
  if(result?.kind!=="generated"||typeof result.reply!=="string"||!result.reply.trim()||
     !Array.isArray(result.calls) || !result.calls.length)throw Error("Provider result unverified");
  // Never declare a completed turn until its saved work is durable.
  await saveTurn(identity,result.reply);
  const finalStatus=await settle("completed",identity);
  if(finalStatus!=="completed"&&finalStatus!=="already_completed")return {status:"uncertain"};
  const metrics=summarizeProviderCalls(result.calls);
  if(metrics&&typeof observe==="function") {
   try {await observe(metrics);} catch {} // Analytics must not break coaching.
  }
  return {status:"completed",reply:result.reply,metrics};
 }catch{
  if(initiated){try{await settle("uncertain",identity);}catch{}}
  return {status:"uncertain"};
 }
}

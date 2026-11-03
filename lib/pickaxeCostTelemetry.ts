/**
 * Non-sensitive, opt-in preview-only provider usage observations.
 * Logs never include member identifiers, request IDs, prompts, responses, or tokens.
 * Provider cost may not be available in the completion payload.
 */
type AnyRecord = Record<string, unknown>;
function record(x:unknown): AnyRecord {
 return x!==null&&typeof x==="object"&&!Array.isArray(x)?x as AnyRecord:{};
}
function finiteNonnegative(x:unknown):number|null {
 return typeof x==="number"&&Number.isFinite(x)&&x>=0?x:null;
}
function nonnegativeInteger(x:unknown):number|null {
 const n=finiteNonnegative(x);return n!==null&&Number.isInteger(n)?n:null;
}
export type ProviderObservation = {
 providerCalls:1;
 costUsd:number|null;
 inputTokens:number|null;
 outputTokens:number|null;
 source:"provider-payload"|"unknown";
};
export function pickaxeResponseObservation(payload:unknown):ProviderObservation {
 const top=record(payload),data=record(top.data);
 const usage=record(Object.keys(record(top.usage)).length?top.usage:data.usage);
 const costCandidates=[top.total_cost_usd,top.cost_usd,data.total_cost_usd,data.cost_usd,
  usage.total_cost_usd,usage.cost_usd];
 const costUsd=costCandidates.map(finiteNonnegative).find(x=>x!==null)??null;
 return {
  providerCalls:1,
  costUsd,
  inputTokens:nonnegativeInteger(usage.input_tokens??usage.prompt_tokens),
  outputTokens:nonnegativeInteger(usage.output_tokens??usage.completion_tokens),
  source:costUsd===null?"unknown":"provider-payload",
 };
}
export function logPreviewProviderObservation(coach:"life"|"fitness"|"budgeting",payload:unknown):void {
 if(process.env.VERCEL_ENV!=="preview"||
    process.env.PREVIEW_PROVIDER_COST_OBSERVATION!=="true")return;
 const observation=pickaxeResponseObservation(payload);
 // Strict allowlist of safe, non-identifying fields.
 console.info("[preview-provider-cost]",JSON.stringify({coach,...observation}));
}

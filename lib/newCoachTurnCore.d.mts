export type ProviderCallObservation = {attempts:number;costUsd:number|null;inputTokens:number|null;outputTokens:number|null};
export type CoachCostSummary = {providerCalls:number;costUsd:number|null;inputTokens:number|null;outputTokens:number|null};
export function summarizeProviderCalls(calls:ProviderCallObservation[]):Readonly<CoachCostSummary>|null;
export type NewCoachTurnResult =
 | {status:"blocked";reason:string}
 | {status:"no-model"}
 | {status:"uncertain"}
 | {status:"completed";reply:string;metrics:Readonly<CoachCostSummary>|null};
export function runNewCoachTurn(options:{
 authorize:()=>Promise<{ok:boolean;memberId?:string;memberEmail?:string}|null>;
 reserve:(identity:{ok:boolean;memberId?:string;memberEmail?:string})=>Promise<string>;
 settle:(outcome:"completed"|"released"|"uncertain",identity:{ok:boolean;memberId?:string;memberEmail?:string})=>Promise<string>;
 generate:(identity:{ok:boolean;memberId?:string;memberEmail?:string})=>Promise<
  {kind:"no-model"}|{kind:"generated";reply:string;calls:ProviderCallObservation[]}>;
 saveTurn:(identity:{ok:boolean;memberId?:string;memberEmail?:string},reply:string)=>Promise<void>;
 observe?:(metrics:Readonly<CoachCostSummary>)=>Promise<void>;
}):Promise<NewCoachTurnResult>;

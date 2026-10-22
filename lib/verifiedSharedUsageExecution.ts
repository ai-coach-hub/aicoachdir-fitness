// Composition boundary for eventual real coach handlers. Not imported by live routes.
// Authentication, billing and prior-ledger checks must happen in the injected
// authorize function BEFORE any reservation or model/provider call.
import {runMeteredPreviewGeneration,type PreviewChargeResult,type PreviewMeterPort} from "./previewLifeUsageFlow";
import type {SharedUsageDecision} from "./sharedAiEntitlementPolicy";

export async function executeVerifiedSharedAiRequest<T>(
  authorize:()=>Promise<SharedUsageDecision>,
  createMeter:(approved:Extract<SharedUsageDecision,{allowed:true}>)=>PreviewMeterPort,
  generate:()=>Promise<{kind:"generated";value:T}|{kind:"no-model"}>
):Promise<
  | {status:"denied";reason:string}
  | PreviewChargeResult<T>
> {
  let approved:SharedUsageDecision;
  try {approved=await authorize();}
  catch {return {status:"denied",reason:"billing_unverified"};}
  if (!approved.allowed) return {status:"denied",reason:approved.reason};
  // This factory must use exactly the server-authorized account, allowance
  // family, period and replay key. Clients cannot supply alternative meter IDs.
  try {
    const meter=createMeter(approved);
    return await runMeteredPreviewGeneration(meter,generate);
  } catch {
    return {status:"uncertain"};
  }
}

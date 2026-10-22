// Pure orchestration for opt-in preview-only Life Coach metering.
// No database calls or model calls occur unless a trusted caller supplies them.
// Caller must authenticate the member and resolve the billing period server-side.
export type PreviewChargeResult<T> =
  | { status: "completed"; value: T }
  | { status: "blocked"; reason: string }
  | { status: "uncertain" };

export type PreviewMeterPort = {
  reserve: () => Promise<string>;
  settle: (outcome: "completed" | "released" | "uncertain") => Promise<string>;
};

// Use this ONLY around new model generation; saved goal capture and memory recall
// must return through their existing zero-inference paths before entering here.
export async function runMeteredPreviewGeneration<T>(
  port: PreviewMeterPort,
  generate: () => Promise<{ kind: "generated"; value: T } | { kind: "no-model" }>
): Promise<PreviewChargeResult<T>> {
  const status = await port.reserve();
  // Never call an upstream provider for a replay, an expired membership or an exhausted cap.
  if (status !== "reserved") return { status: "blocked", reason: status };
  try {
    const result = await generate();
    if (result.kind === "no-model") {
      const released = await port.settle("released");
      if (released !== "released" && released !== "already_released")
        return { status: "uncertain" };
      return { status: "blocked", reason: "no-model" };
    }
    const settled = await port.settle("completed");
    if (settled !== "completed" && settled !== "already_completed")
      return { status: "uncertain" };
    return { status: "completed", value: result.value };
  } catch {
    // If a provider call was attempted, timeouts and ambiguous failures may have
    // incurred charges. Keep the reservation until an operator reconciles it.
    try { await port.settle("uncertain"); } catch { /* do not mask upstream uncertainty */ }
    return { status: "uncertain" };
  }
}

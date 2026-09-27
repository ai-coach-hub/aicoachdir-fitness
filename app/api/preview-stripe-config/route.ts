import { NextResponse } from "next/server";
import {
  ensureFitnessPriceId,
  ensureWebhookSecret,
  stripeConfigured,
} from "@/lib/stripeServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const result = {
    stripeConfigured: stripeConfigured(),
    priceReady: false,
    webhookReady: false,
  };

  if (!result.stripeConfigured) {
    return NextResponse.json(result, { status: 503 });
  }

  try {
    await ensureFitnessPriceId();
    result.priceReady = true;
  } catch {
    return NextResponse.json(result, { status: 500 });
  }

  try {
    const origin = new URL(request.url).origin;
    await ensureWebhookSecret(origin);
    result.webhookReady = true;
  } catch {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}

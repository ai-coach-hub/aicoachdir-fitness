import { NextResponse } from "next/server";
import { ensureStripeBillingResources, stripeConfigured } from "@/lib/stripeServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json({ stripeConfigured: false, billingReady: false });
  }

  try {
    const origin = new URL(request.url).origin;
    await ensureStripeBillingResources(origin);
    return NextResponse.json({ stripeConfigured: true, billingReady: true });
  } catch {
    return NextResponse.json(
      { stripeConfigured: true, billingReady: false },
      { status: 500 },
    );
  }
}

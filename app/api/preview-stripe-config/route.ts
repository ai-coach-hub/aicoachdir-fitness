import { NextResponse } from "next/server";
import { stripeConfigured } from "@/lib/stripeServer";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { stripeConfigured: stripeConfigured() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

import { POST as createCheckoutSession } from "@/app/api/billing/create-checkout-session/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Keep checkout under /fitness so the Terms-acceptance cookie is available.
export async function POST(request: Request) {
  return createCheckoutSession(request);
}

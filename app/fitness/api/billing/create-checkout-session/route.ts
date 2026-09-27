import { POST as createCheckoutSession } from "@/app/api/billing/create-checkout-session/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Keep checkout within /fitness so the scoped Terms-acceptance cookie is sent.
export async function POST(request: Request) {
  return createCheckoutSession(request);
}

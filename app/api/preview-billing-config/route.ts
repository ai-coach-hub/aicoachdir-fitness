import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return new NextResponse(null, { status: 404 });
  }

  return NextResponse.json(
    {
      stripeSecretConfigured: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
      stripePriceConfigured: Boolean(process.env.STRIPE_FITNESS_PRICE_ID?.trim()),
      stripeWebhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim()),
      pickaxeConfigured: Boolean(process.env.PICKAXE_WORKSPACE_API_TOKEN?.trim()),
      databaseConfigured: Boolean(
        process.env.STORAGE_URL?.trim() ||
        process.env.DATABASE_URL?.trim() ||
        process.env.POSTGRES_URL?.trim()
      ),
      clerkConfigured: Boolean(
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() &&
        process.env.CLERK_SECRET_KEY?.trim()
      ),
    },
    { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } },
  );
}

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return new NextResponse(null, { status: 404 });
  }

  return NextResponse.json(
    {
      preview: true,
      pickaxeSignupUrlConfigured: Boolean(
        process.env.NEXT_PUBLIC_PICKAXE_FITNESS_SIGNUP_URL?.trim()
      ),
      clerkPublishableKeyConfigured: Boolean(
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim()
      ),
      clerkSecretKeyConfigured: Boolean(process.env.CLERK_SECRET_KEY?.trim()),
      databaseConfigured: Boolean(
        process.env.STORAGE_URL?.trim() ||
          process.env.DATABASE_URL?.trim() ||
          process.env.POSTGRES_URL?.trim()
      ),
      pickaxeWorkspaceTokenConfigured: Boolean(
        process.env.PICKAXE_WORKSPACE_API_TOKEN?.trim()
      ),
      pickaxeCoachDeploymentConfigured: Boolean(
        process.env.PICKAXE_FITNESS_COACH_DEPLOYMENT_ID?.trim() ||
          process.env.PICKAXE_FITNESS_COACH_DEPLOYMENT_TOKEN?.trim() ||
          process.env.PICKAXE_FITNESS_DEPLOYMENT_TOKEN?.trim() ||
          process.env.PICKAXE_DEPLOYMENT_API_KEY?.trim()
      ),
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    }
  );
}

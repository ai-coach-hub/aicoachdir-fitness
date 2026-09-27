import { NextResponse } from "next/server";
import {
  getPickaxeSsoPublicKeyPem,
  PICKAXE_FITNESS_SSO_DEPLOYMENT_ID,
  PICKAXE_SSO_ISSUER,
  PICKAXE_SSO_KEY_ID,
  PICKAXE_STUDIO_ID,
  PICKAXE_WORKSPACE_ID,
} from "@/lib/pickaxeSso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return new NextResponse(null, { status: 404 });
  }

  return NextResponse.json(
    {
      issuer: PICKAXE_SSO_ISSUER,
      keyId: PICKAXE_SSO_KEY_ID,
      publicKey: getPickaxeSsoPublicKeyPem(),
      workspaceId: PICKAXE_WORKSPACE_ID,
      studioId: PICKAXE_STUDIO_ID,
      deploymentId: PICKAXE_FITNESS_SSO_DEPLOYMENT_ID,
      allowedOrigins: [
        "https://www.aicoachdir.com",
        "https://aicoachdir-fitness-git-fix-member-signup-identity-bridge-kcb3.vercel.app",
      ],
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    },
  );
}

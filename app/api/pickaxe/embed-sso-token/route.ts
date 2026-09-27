import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createPickaxeEmbedJwt } from "@/lib/pickaxeSso";
import {
  PICKAXE_FITNESS_FORM_ID,
  PICKAXE_FITNESS_SSO_DEPLOYMENT_ID,
  PICKAXE_STUDIO_ID,
} from "@/lib/pickaxeConstants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function primaryEmailForUser(user: Awaited<ReturnType<typeof currentUser>>) {
  if (!user) return "";
  const primary = user.emailAddresses.find(
    (item) => item.id === user.primaryEmailAddressId,
  );
  return (primary?.emailAddress || user.emailAddresses[0]?.emailAddress || "")
    .trim()
    .toLowerCase();
}

export async function POST(request: Request) {
  const user = await currentUser();
  const email = primaryEmailForUser(user);

  if (!user || !email) {
    return NextResponse.json({ token: null }, { status: 401 });
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {}

  const input =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};

  const deploymentId = String(input.deploymentId || "");
  const studioId = String(input.studioId || "");
  const pickaxeId = String(input.pickaxeId || "");

  if (
    deploymentId !== PICKAXE_FITNESS_SSO_DEPLOYMENT_ID ||
    (studioId && studioId !== PICKAXE_STUDIO_ID) ||
    (pickaxeId && pickaxeId !== PICKAXE_FITNESS_FORM_ID)
  ) {
    return NextResponse.json({ token: null }, { status: 403 });
  }

  const token = createPickaxeEmbedJwt({
    userId: user.id,
    email,
  });

  return NextResponse.json(
    { token },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    },
  );
}

import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return noStoreJson(
      { ok: false, authenticated: false, hasPaidAccess: false },
      401
    );
  }

  const user = await currentUser();

  const email =
    user?.emailAddresses.find(
      (address) => address.id === user.primaryEmailAddressId
    )?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress ??
    null;

  if (!email) {
    return noStoreJson(
      {
        ok: false,
        authenticated: true,
        hasPaidAccess: false,
        error: "No verified email found",
      },
      400
    );
  }

  const apiKey = process.env.PICKAXE_WORKSPACE_API_KEY;

  if (!apiKey) {
    return noStoreJson(
      {
        ok: false,
        authenticated: true,
        hasPaidAccess: false,
        error: "Server configuration error",
      },
      500
    );
  }

  const normalizedEmail = email.trim().toLowerCase();
  const url = `https://api.pickaxe.co/v1/studio/user/${encodeURIComponent(
    normalizedEmail
  )}`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (response.status === 404) {
      return noStoreJson({
        ok: true,
        authenticated: true,
        email: normalizedEmail,
        hasPaidAccess: false,
        reason: "pickaxe_user_not_found",
      });
    }

    if (!response.ok) {
      console.error("Pickaxe subscription lookup failed.", response.status);
      return noStoreJson(
        {
          ok: false,
          authenticated: true,
          hasPaidAccess: false,
          error: "Unable to verify membership",
        },
        502
      );
    }

    const result = await response.json();
    const pickaxeUser = result?.data ?? result?.user ?? result;

    const boughtProducts = Array.isArray(pickaxeUser?.boughtProducts)
      ? pickaxeUser.boughtProducts
      : [];
    const giftedProducts = Array.isArray(pickaxeUser?.giftedProducts)
      ? pickaxeUser.giftedProducts
      : [];

    const hasPaidAccess =
      boughtProducts.length > 0 || giftedProducts.length > 0;

    return noStoreJson({
      ok: true,
      authenticated: true,
      email: normalizedEmail,
      hasPaidAccess,
      accessSummary: {
        boughtProducts: boughtProducts.length,
        giftedProducts: giftedProducts.length,
      },
    });
  } catch {
    console.error("Pickaxe subscription verification failed.");
    return noStoreJson(
      {
        ok: false,
        authenticated: true,
        hasPaidAccess: false,
        error: "Unable to verify membership",
      },
      502
    );
  }
}

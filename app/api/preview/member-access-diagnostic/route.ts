import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { memberHasFitnessAccess } from "@/lib/fitnessMembershipDb";
import {
  getPickaxeUser,
  previewPickaxeAccessDiagnostic,
} from "@/lib/pickaxeAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function primaryEmail(user: Awaited<ReturnType<typeof currentUser>>) {
  if (!user) return "";
  const primary = user.emailAddresses.find(
    (item) => item.id === user.primaryEmailAddressId,
  );
  return (primary?.emailAddress || user.emailAddresses[0]?.emailAddress || "")
    .trim()
    .toLowerCase();
}

function safeProductShape(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((item) => {
    if (typeof item === "string" || typeof item === "number") {
      return { value: String(item) };
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { value: String(item ?? "") };
    }
    const record = item as Record<string, unknown>;
    return {
      keys: Object.keys(record).sort(),
      id: String(record.id ?? record.productId ?? record._id ?? ""),
      name: String(record.name ?? record.title ?? ""),
      status: String(record.status ?? ""),
    };
  });
}

function safeUserShape(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      keys: [],
      accessGroupId: null,
      products: [],
      productIds: [],
      boughtProducts: [],
      giftedProducts: [],
      type: "",
      signupPortalId: "",
    };
  }

  const record = value as Record<string, unknown>;
  return {
    keys: Object.keys(record).sort(),
    accessGroupId:
      typeof record.accessGroupId === "string" ? record.accessGroupId : null,
    products: safeProductShape(record.products),
    productIds: Array.isArray(record.productIds)
      ? record.productIds.map((item) => String(item || "")).filter(Boolean)
      : [],
    boughtProducts: safeProductShape(record.boughtProducts),
    giftedProducts: safeProductShape(record.giftedProducts),
    type: String(record.type ?? ""),
    signupPortalId: String(record.signupPortalId ?? ""),
  };
}

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const user = await currentUser();
  const email = primaryEmail(user);
  if (!user || !email) {
    return NextResponse.json({ ok: false, signedIn: false }, { status: 401 });
  }

  try {
    const [diagnostic, pickaxeUser] = await Promise.all([
      previewPickaxeAccessDiagnostic(email),
      getPickaxeUser(email),
    ]);
    const userShape = safeUserShape(pickaxeUser);
    const membershipResult = await memberHasFitnessAccess(email, user.id);

    console.warn(
      `[preview-member-access-diagnostic] ${JSON.stringify({
        diagnostic,
        userShape,
        membershipResult,
      })}`,
    );

    return NextResponse.json({
      ok: true,
      signedIn: true,
      recognized: membershipResult,
    });
  } catch (error) {
    console.error("[preview-member-access-diagnostic] failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ ok: false, signedIn: true }, { status: 500 });
  }
}

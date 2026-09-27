import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
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

function safeUserShape(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { keys: [], accessGroupId: null, products: [], productIds: [] };
  }

  const record = value as Record<string, unknown>;
  return {
    keys: Object.keys(record).sort(),
    accessGroupId:
      typeof record.accessGroupId === "string" ? record.accessGroupId : null,
    products: Array.isArray(record.products)
      ? record.products.map((item) => String(item || "")).filter(Boolean)
      : [],
    productIds: Array.isArray(record.productIds)
      ? record.productIds.map((item) => String(item || "")).filter(Boolean)
      : [],
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

    console.warn(
      `[preview-member-access-diagnostic] ${JSON.stringify({
        diagnostic,
        userShape,
      })}`,
    );

    return NextResponse.json({
      ok: true,
      signedIn: true,
      recognized:
        diagnostic.hasCurrentAccessGroup || diagnostic.legacyMatch,
    });
  } catch (error) {
    console.error("[preview-member-access-diagnostic] failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ ok: false, signedIn: true }, { status: 500 });
  }
}

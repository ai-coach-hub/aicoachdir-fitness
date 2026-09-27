import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { previewPickaxeAccessDiagnostic } from "@/lib/pickaxeAccess";

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
    const diagnostic = await previewPickaxeAccessDiagnostic(email);
    console.warn(
      `[preview-member-access-diagnostic] ${JSON.stringify(diagnostic)}`,
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

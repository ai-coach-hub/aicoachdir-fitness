import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getFitnessMembership } from "@/lib/pickaxeMembership";

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

export async function GET() {
  const user = await currentUser();
  const email = primaryEmailForUser(user);

  if (!user || !email) {
    return NextResponse.json({ ok: false, signedIn: false, active: false }, { status: 401 });
  }

  try {
    const membership = await getFitnessMembership(email);
    return NextResponse.json(
      {
        ok: true,
        signedIn: true,
        active: membership.active,
        exists: membership.exists,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { ok: false, signedIn: true, active: false },
      { status: 502 },
    );
  }
}

import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { memberHasFitnessAccess } from "@/lib/fitnessMembershipDb";

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
  const user = await currentUser();
  const email = primaryEmail(user);
  if (!user || !email) {
    return NextResponse.json({ active: false }, { status: 401 });
  }

  try {
    const active = await memberHasFitnessAccess(email, user.id);
    return NextResponse.json(
      { active },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ active: false }, { status: 503 });
  }
}

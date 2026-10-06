import { createHmac } from "node:crypto";
import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { memberHasFitnessAccess } from "@/lib/fitnessMembershipDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUDGETING_ORIGIN = "https://aicoachdir-budgeting.vercel.app";

function primaryEmail(user: Awaited<ReturnType<typeof currentUser>>) {
  if (!user) return "";
  const primary = user.emailAddresses.find(
    (item) => item.id === user.primaryEmailAddressId,
  );
  return (primary?.emailAddress || user.emailAddresses[0]?.emailAddress || "")
    .trim()
    .toLowerCase();
}

function handoffSecret() {
  return String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET || "").trim();
}

function signHandoff(email: string, expires: string) {
  return createHmac("sha256", handoffSecret())
    .update(`budget-membership\n${email}\n${expires}`, "utf8")
    .digest("hex");
}

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/fitness/login", request.url));
  }

  const email = primaryEmail(user);
  if (!email) {
    return NextResponse.redirect(new URL("/fitness/login", request.url));
  }

  let active = false;
  try {
    active = await memberHasFitnessAccess(email, user.id);
  } catch {
    return new NextResponse("Membership verification is temporarily unavailable.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (!active) {
    return NextResponse.redirect(new URL("/fitness/subscribe", request.url));
  }

  if (!handoffSecret()) {
    return new NextResponse("Budgeting membership handoff is not configured.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const expires = String(Date.now() + 5 * 60 * 1000);
  const target = new URL("/access", BUDGETING_ORIGIN);
  target.searchParams.set("email", email);
  target.searchParams.set("expires", expires);
  target.searchParams.set("signature", signHandoff(email, expires));

  return NextResponse.redirect(target);
}

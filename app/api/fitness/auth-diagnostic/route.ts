import { auth, currentUser } from "@clerk/nextjs/server";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

type Diagnostic = {
  authUserIdPresent: boolean;
  authSessionIdPresent: boolean;
  authError: boolean;
  currentUserPresent: boolean;
  currentUserEmailPresent: boolean;
  currentUserError: boolean;
  host: string | null;
  forwardedHost: string | null;
  forwardedProto: string | null;
  publishableKeyLooksLive: boolean;
  secretKeyLooksLive: boolean;
};

export async function GET() {
  const requestHeaders = await headers();

  let authUserIdPresent = false;
  let authSessionIdPresent = false;
  let authError = false;

  try {
    const authState = await auth();
    authUserIdPresent = Boolean(authState.userId);
    authSessionIdPresent = Boolean(authState.sessionId);
  } catch {
    authError = true;
  }

  let currentUserPresent = false;
  let currentUserEmailPresent = false;
  let currentUserError = false;

  try {
    const user = await currentUser();
    currentUserPresent = Boolean(user);
    currentUserEmailPresent = Boolean(
      user?.emailAddresses?.some((item) => Boolean(item.emailAddress)),
    );
  } catch {
    currentUserError = true;
  }

  const diagnostic: Diagnostic = {
    authUserIdPresent,
    authSessionIdPresent,
    authError,
    currentUserPresent,
    currentUserEmailPresent,
    currentUserError,
    host: requestHeaders.get("host"),
    forwardedHost: requestHeaders.get("x-forwarded-host"),
    forwardedProto: requestHeaders.get("x-forwarded-proto"),
    publishableKeyLooksLive: (
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ""
    ).startsWith("pk_live_"),
    secretKeyLooksLive: (process.env.CLERK_SECRET_KEY ?? "").startsWith(
      "sk_live_",
    ),
  };

  console.info("[fitness-auth-diagnostic]", JSON.stringify(diagnostic));

  return Response.json(
    {
      recorded: true,
      ...diagnostic,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

function requiresMemberLogin(pathname: string) {
  return (
    pathname.startsWith("/fitness/chat") ||
    pathname.startsWith("/budget/") ||
    pathname.startsWith("/budgeting/launch")
  );
}

export default clerkMiddleware(async (auth, request) => {
  const pathname = request.nextUrl.pathname;

  if (!requiresMemberLogin(pathname)) return;

  const { userId } = await auth();
  if (userId) return;

  if (pathname.startsWith("/budget/api/")) {
    return NextResponse.json(
      { ok: false, error: "Member login required" },
      { status: 401 },
    );
  }

  const loginUrl = new URL("/fitness/login", request.url);
  return NextResponse.redirect(loginUrl);
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};

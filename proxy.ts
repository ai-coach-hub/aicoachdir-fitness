import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

function loginDestination(pathname: string) {
  if (pathname === "/budget/tracker") return "budget-tracker";
  return "budget-coach";
}

export default clerkMiddleware(async (auth, request) => {
  const pathname = request.nextUrl.pathname;

  if (!pathname.startsWith("/budget/")) return;

  const { userId } = await auth();
  if (userId) return;

  if (pathname.startsWith("/budget/api/")) {
    return NextResponse.json(
      { ok: false, error: "Member login is required." },
      { status: 401 },
    );
  }

  const loginUrl = new URL("/fitness/login", request.url);
  loginUrl.searchParams.set("destination", loginDestination(pathname));
  return NextResponse.redirect(loginUrl);
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};

import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";

export async function GET() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    return NextResponse.json(
      { authenticated: false },
      { status: 401 }
    );
  }

  const user = await currentUser();

  if (!user) {
    return NextResponse.json(
      { authenticated: false },
      { status: 404 }
    );
  }

  const email =
    user.emailAddresses.find(
      (address) => address.id === user.primaryEmailAddressId
    )?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    null;

  return NextResponse.json({
    authenticated: true,
    email,
  });
}

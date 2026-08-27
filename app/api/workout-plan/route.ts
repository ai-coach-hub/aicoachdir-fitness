import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";

const WORKOUT_MEMORY_ID = "MEMORYRBBQW7QSNBR1ITQ6QCD6";

export async function GET() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const user = await currentUser();

  const email =
    user?.emailAddresses.find(
      (address) => address.id === user.primaryEmailAddressId
    )?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress ??
    null;

  if (!email) {
    return NextResponse.json(
      { error: "No verified email found" },
      { status: 400 }
    );
  }

  const apiKey = process.env.PICKAXE_WORKSPACE_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  const url =
    `https://api.pickaxe.co/v1/studio/memory/user/${encodeURIComponent(email)}` +
    `?memoryId=${encodeURIComponent(WORKOUT_MEMORY_ID)}&skip=0&take=10`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: "Unable to retrieve workout plan" },
      { status: 502 }
    );
  }

  const result = await response.json();
  const memory = result?.data?.[0];

  if (!memory?.value) {
    return NextResponse.json({
      success: true,
      plan: null,
    });
  }

  try {
    const plan = JSON.parse(memory.value);

    return NextResponse.json({
      success: true,
      plan,
    });
  } catch {
    return NextResponse.json(
      { error: "Workout plan could not be parsed" },
      { status: 500 }
    );
  }
}

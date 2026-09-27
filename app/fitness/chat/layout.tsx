import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
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

// Keep the Fitness Coach member hub behind one AI Coach Directory login
// and one verified Pickaxe Fitness Coach membership.
export default async function FitnessChatLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await currentUser();

  if (!user) {
    redirect("/fitness/login");
  }

  const memberEmail = primaryEmailForUser(user);
  if (!memberEmail) {
    redirect("/fitness/login");
  }

  let membership;
  try {
    membership = await getFitnessMembership(memberEmail);
  } catch {
    throw new Error("Fitness membership verification is temporarily unavailable.");
  }

  if (!membership.configured) {
    throw new Error("Fitness membership verification is not configured.");
  }

  if (!membership.active) {
    redirect("/fitness/subscribe");
  }

  return children;
}

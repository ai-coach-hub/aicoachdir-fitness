import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
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

export default async function FitnessChatLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await currentUser();
  if (!user) redirect("/fitness/login?destination=fitness");

  const email = primaryEmail(user);
  if (!email) redirect("/fitness/login?destination=fitness");

  let active = false;
  try {
    active = await memberHasFitnessAccess(email, user.id);
  } catch {
    throw new Error("Fitness membership verification is temporarily unavailable.");
  }

  if (!active) redirect("/fitness/subscribe");

  return children;
}

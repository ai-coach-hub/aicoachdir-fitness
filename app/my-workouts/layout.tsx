import { redirect } from "next/navigation";
import { getCurrentFitnessMember } from "@/lib/currentFitnessMember";

export const dynamic = "force-dynamic";

export default async function MyWorkoutsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const member = await getCurrentFitnessMember();

  if (!member.authenticated) {
    redirect("/sign-in");
  }

  if (!member.membershipCheckOk || !member.hasFitnessAccess) {
    redirect("/fitness/login");
  }

  return children;
}

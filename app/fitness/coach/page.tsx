import { redirect } from "next/navigation";
import { getCurrentFitnessMember } from "@/lib/currentFitnessMember";
import CoachChat from "./CoachChat";

export const dynamic = "force-dynamic";

export default async function FitnessCoachPage() {
  const member = await getCurrentFitnessMember();

  if (!member.authenticated) {
    redirect("/sign-in");
  }

  if (!member.membershipCheckOk || !member.hasFitnessAccess) {
    redirect("/fitness/login");
  }

  return <CoachChat />;
}

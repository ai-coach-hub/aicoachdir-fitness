import { auth, currentUser } from "@clerk/nextjs/server";
import { verifyFitnessAccess } from "@/lib/pickaxeMembership";

export type CurrentFitnessMember = {
  authenticated: boolean;
  userId: string | null;
  email: string | null;
  hasFitnessAccess: boolean;
  membershipCheckOk: boolean;
  membershipReason: string | null;
};

export async function getCurrentFitnessMember(): Promise<CurrentFitnessMember> {
  const { userId } = await auth();

  if (!userId) {
    return {
      authenticated: false,
      userId: null,
      email: null,
      hasFitnessAccess: false,
      membershipCheckOk: true,
      membershipReason: null,
    };
  }

  const user = await currentUser();
  const email =
    user?.emailAddresses.find(
      (address) => address.id === user.primaryEmailAddressId
    )?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress ??
    null;

  if (!email) {
    return {
      authenticated: true,
      userId,
      email: null,
      hasFitnessAccess: false,
      membershipCheckOk: false,
      membershipReason: "no_verified_email",
    };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const membership = await verifyFitnessAccess(normalizedEmail);

  return {
    authenticated: true,
    userId,
    email: normalizedEmail,
    hasFitnessAccess: membership.hasFitnessAccess,
    membershipCheckOk: membership.ok,
    membershipReason: membership.reason,
  };
}

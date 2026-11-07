/**
 * Isolated introductory-credit policy.  No live route imports this module.
 * Activation must be independently gated, tested and reviewed across apps.
 */
export const INTRODUCTORY_MESSAGE_LIMIT = 15 as const;
export const INTRODUCTORY_ENTITLEMENT = "introductory_lifetime_v1" as const;
export type TrialIdentity = {
  clerkUserId: string;
  emailVerified: boolean;
  existingPaidOrLegacyMember: boolean;
  previouslyGranted: boolean;
};
export function introductoryTrialEligible(identity: TrialIdentity): boolean {
  return /^user_[A-Za-z0-9_-]{8,128}$/.test(identity.clerkUserId) &&
    identity.emailVerified &&
    !identity.existingPaidOrLegacyMember &&
    !identity.previouslyGranted;
}
export function introductoryTrialRemaining(completed: number, reserved: number): number {
  if (!Number.isInteger(completed) || !Number.isInteger(reserved) || completed < 0 || reserved < 0 ||
      completed + reserved > INTRODUCTORY_MESSAGE_LIMIT) {
    throw new Error("Invalid introductory allowance state");
  }
  return INTRODUCTORY_MESSAGE_LIMIT - completed - reserved;
}
export function canStartIntroductoryGeneration(completed: number, reserved: number): boolean {
  return introductoryTrialRemaining(completed, reserved) > 0;
}

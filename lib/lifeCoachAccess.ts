import { currentUser } from "@clerk/nextjs/server";

// Access is only enabled for a verified primary Clerk email on the private Preview branch.
// Stored conversation ownership always uses Clerk's stable user.id, not the email.
export async function lifeTester() {
  const privatePreview=process.env.VERCEL_ENV==="preview" &&
      process.env.VERCEL_GIT_COMMIT_REF==="feature/life-coach-agent-sandbox-20261011";
  const upgradeQaPreview=process.env.VERCEL_ENV==="preview" &&
      process.env.VERCEL_GIT_COMMIT_REF==="feature/verified-subscription-upgrade-policy-20261027";
  const cutover=String(process.env.SHARED_USAGE_CUTOVER_AT||"");
  const stamp=Date.parse(cutover);
  const cutoverReady=Number.isFinite(stamp)&&new Date(stamp).toISOString()===cutover;
  const mode=String(process.env.SHARED_USAGE_MIGRATION_MODE||"");
  const openingReady=mode==="rolling_renewal" ||
    ((mode===""||mode==="reconciled") &&
      process.env.SHARED_USAGE_OPENING_BALANCES_RECONCILED==="true");
  const released=process.env.VERCEL_ENV==="production" &&
      cutoverReady &&
      process.env.SHARED_USAGE_GATE_ENABLED==="true" &&
      process.env.SHARED_USAGE_PUBLIC_RELEASE_APPROVED==="true" &&
      openingReady &&
      process.env.LIFE_COACH_LIVE_ENABLED==="true";
  if(!privatePreview&&!released&&!upgradeQaPreview)return null;
  const user = await currentUser();
  if (!user) return null;
  const primary = user.emailAddresses.find(e => e.id === user.primaryEmailAddressId);
  if (!primary || primary.verification?.status !== "verified") return null;
  const email = primary.emailAddress.trim().toLowerCase();
  const allowed = (process.env.LIFE_COACH_TESTER_EMAILS || "")
    .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
  if(privatePreview)return allowed.includes(email)?user.id:null;
  if(upgradeQaPreview){
    const {stripeMode}=await import("./stripeServer");
    if(stripeMode()!=="test")return null;
    const {getFitnessMembership}=await import("./fitnessMembershipDb");
    // The verified Clerk login is already authorized by the isolated site
    // membership table. Do not make a second Stripe API call solely to render
    // the coach link; Stripe revalidation is handled by membership access.
    const member=await getFitnessMembership(email);
    if(!member||member.access_active!==true||member.clerk_user_id!==user.id||
      !member.stripe_customer_id||!member.stripe_subscription_id||
      !["active","trialing"].includes(String(member.stripe_status)))return null;
    return user.id;
  }
  // One existing verified subscription unlocks Life; no new checkout.
  // Production is otherwise unreachable until the three release gates above
  // and the shared quota migration have been explicitly enabled.
  const {getFitnessMembership,restoreVerifiedHistoricalBillingForMember,
    memberHasFitnessAccess}=await import("./fitnessMembershipDb");
  // Neon is not a complete member directory. On a VERIFIED Clerk sign-in,
  // attempt historical paid-status recovery before the normal Pickaxe fallback.
  // Existing account data, subscription and history are never overwritten by
  // an unverified lookup; errors do not prevent normal existing-member checks.
  try {
    if(!await getFitnessMembership(email))
      await restoreVerifiedHistoricalBillingForMember(email,user.id);
  }catch(error){
    console.error("[life] historical membership lookup deferred",{
      message:error instanceof Error?error.message:String(error)
    });
  }
  return await memberHasFitnessAccess(email,user.id)?user.id:null;
}

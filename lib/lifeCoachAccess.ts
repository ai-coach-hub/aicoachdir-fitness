import { currentUser } from "@clerk/nextjs/server";

// Access is only enabled for a verified primary Clerk email on the private Preview branch.
// Stored conversation ownership always uses Clerk's stable user.id, not the email.
export async function lifeTester() {
  const privatePreview=process.env.VERCEL_ENV==="preview" &&
      process.env.VERCEL_GIT_COMMIT_REF==="feature/life-coach-agent-sandbox-20261011";
  const released=process.env.VERCEL_ENV==="production" &&
      process.env.SHARED_USAGE_GATE_ENABLED==="true" &&
      process.env.SHARED_USAGE_PUBLIC_RELEASE_APPROVED==="true" &&
      process.env.SHARED_USAGE_OPENING_BALANCES_RECONCILED==="true" &&
      process.env.LIFE_COACH_LIVE_ENABLED==="true";
  if(!privatePreview&&!released)return null;
  const user = await currentUser();
  if (!user) return null;
  const primary = user.emailAddresses.find(e => e.id === user.primaryEmailAddressId);
  if (!primary || primary.verification?.status !== "verified") return null;
  const email = primary.emailAddress.trim().toLowerCase();
  const allowed = (process.env.LIFE_COACH_TESTER_EMAILS || "")
    .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
  if(privatePreview)return allowed.includes(email)?user.id:null;
  // One existing verified subscription unlocks Life; no new checkout.
  // Production is otherwise unreachable until the three release gates above
  // and the shared quota migration have been explicitly enabled.
  const {memberHasFitnessAccess}=await import("./fitnessMembershipDb");
  return await memberHasFitnessAccess(email,user.id)?user.id:null;
}

import { currentUser } from "@clerk/nextjs/server";

// Access is only enabled for a verified primary Clerk email on the private Preview branch.
// Stored conversation ownership always uses Clerk's stable user.id, not the email.
export async function lifeTester() {
  if (process.env.VERCEL_ENV !== "preview" ||
      process.env.VERCEL_GIT_COMMIT_REF !== "feature/life-coach-agent-sandbox-20261011") return null;
  const user = await currentUser();
  if (!user) return null;
  const primary = user.emailAddresses.find(e => e.id === user.primaryEmailAddressId);
  if (!primary || primary.verification?.status !== "verified") return null;
  const email = primary.emailAddress.trim().toLowerCase();
  const allowed = (process.env.LIFE_COACH_TESTER_EMAILS || "")
    .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(email) ? user.id : null;
}

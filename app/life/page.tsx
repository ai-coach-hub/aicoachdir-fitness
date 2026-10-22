import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { lifeTester } from "@/lib/lifeCoachAccess";
import LifeChat from "./LifeChat";
export const dynamic = "force-dynamic";
export default async function LifePage() {
  const id = await lifeTester();
  if (id) return <main className="site-shell" style={{padding:"32px 0"}}>
    <Link href="/" style={{color:"#80d84e"}}>← AI Coach Directory</Link>
    <LifeChat/>
  </main>;
  const user = await currentUser();
  const production = process.env.VERCEL_ENV === "production";
  const cutover = String(process.env.SHARED_USAGE_CUTOVER_AT || "");
  const stamp = Date.parse(cutover);
  const cutoverReady = Number.isFinite(stamp) && new Date(stamp).toISOString() === cutover;
  const lifeReady = production && cutoverReady &&
    process.env.SHARED_USAGE_GATE_ENABLED === "true" &&
    process.env.SHARED_USAGE_PUBLIC_RELEASE_APPROVED === "true" &&
    process.env.SHARED_USAGE_OPENING_BALANCES_RECONCILED === "true" &&
    process.env.LIFE_COACH_LIVE_ENABLED === "true";
  return <main className="site-shell" style={{padding:"48px 0"}}>
    <h1>{production ? "AI Coaching for Life" : "Private Life Coach Preview"}</h1>
    {production ? (
      <p>{!lifeReady
        ? "Life Coach is coming soon. Your existing Fitness and Budgeting access is unchanged."
        : user
          ? "Life Coach is included with eligible AI Coach Directory memberships. This account cannot access it; please review your membership status."
          : "Sign in with your existing AI Coach Directory membership to use Life Coach. No second subscription is required."}</p>
    ) : (
      <>
        <p>{user ? "This signed-in account is not approved for this private test. Please use an approved, verified Clerk account." : "Sign in with your approved test account to continue."}</p>
        <p>This test does not require an active Fitness subscription or payment.</p>
      </>
    )}
    {!user && (!production || lifeReady) &&
      <Link href="/sign-in?redirect_url=%2Flife" className="primary-button">
        {production ? "Member Sign In" : "Sign in to test Life Coach"}
      </Link>}
    <p><Link href="/">Return to AI Coach Directory</Link></p>
  </main>;
}

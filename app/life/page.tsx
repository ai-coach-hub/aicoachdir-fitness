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
  return <main className="site-shell" style={{padding:"48px 0"}}>
    <h1>Private Life Coach Preview</h1>
    <p>{user ? "This signed-in account is not approved for this private test. Please use an approved, verified Clerk account." : "Sign in with your approved test account to continue."}</p>
    <p>This test does not require an active Fitness subscription or payment.</p>
    {!user && <Link href="/sign-in?redirect_url=%2Flife" className="primary-button">Sign in to test Life Coach</Link>}
    <p><Link href="/">Return to AI Coach Directory</Link></p>
  </main>;
}

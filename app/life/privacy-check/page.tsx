import Link from "next/link";
import { lifeTester } from "@/lib/lifeCoachAccess";
import PrivacyCheckClient from "./PrivacyCheckClient";

export const dynamic = "force-dynamic";

export default async function LifePrivacyCheckPage() {
  const member = await lifeTester();
  return <main className="site-shell" style={{padding:"42px 0",display:"grid",gap:18}}>
    <p style={{margin:0}}><Link href="/life">← Back to Life Coach</Link></p>
    <h1 style={{margin:0}}>Private Life Coach privacy check</h1>
    {member
      ? <PrivacyCheckClient/>
      : <p>This check is available only to a signed-in, verified internal
          account approved for the private Life Coach preview. It is not part
          of a paid membership.</p>}
  </main>;
}

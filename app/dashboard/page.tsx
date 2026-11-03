import Image from "next/image";
import Link from "next/link";
import {currentUser} from "@clerk/nextjs/server";
import {redirect} from "next/navigation";
import {memberHasFitnessAccess} from "@/lib/fitnessMembershipDb";
import {lifeTester} from "@/lib/lifeCoachAccess";
import {isolatedTrialPreviewEnabled} from "@/lib/isolatedIntroductoryIdentity";
import {introHistorySql} from "@/lib/isolatedTrialHistory";
import {assertIsolatedTrialTestCheckout} from "@/lib/isolatedTrialCheckoutSafety";
import ConvertedTrialDashboard from "@/components/ConvertedTrialDashboard";
import styles from "./dashboard.module.css";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) redirect("/fitness/login");
  const primary = user.emailAddresses.find(item => item.id === user.primaryEmailAddressId);
  if (!primary || primary.verification?.status !== "verified") {
    return <main className="signup-shell"><h1>Verify your membership email</h1><Link href="/fitness/login">Member Login</Link></main>;
  }
  const email = primary.emailAddress.trim().toLowerCase();
  // Strictly private PR #251: route the converted synthetic tester to the
  // isolated history dashboard, not the real Pickaxe coaching integrations.
  // Every regular production member continues through the existing path.
  if(isolatedTrialPreviewEnabled() &&
     user.id===process.env.INTRODUCTORY_TRIAL_DEDICATED_TEST_CLERK_ID){
    try{
      await assertIsolatedTrialTestCheckout();
      const sql=await introHistorySql();
      const [grants,members]=await Promise.all([
        sql`SELECT converted_at FROM public.introductory_trial_grants
          WHERE clerk_user_id=${user.id} LIMIT 1`,
        sql`SELECT access_active,stripe_status FROM public.fitness_memberships
          WHERE clerk_user_id=${user.id} AND email=${email}
            AND stripe_customer_id IS NOT NULL AND stripe_subscription_id IS NOT NULL LIMIT 1`
      ]);
      if(grants.length===1&&grants[0].converted_at!=null&&members.length===1&&
        members[0].access_active===true &&
        ["active","trialing"].includes(String(members[0].stripe_status)))
        return <ConvertedTrialDashboard firstName={user.firstName||""} userId={user.id}/>;
      return <main className="signup-shell"><h1>Private test membership not ready</h1><p>No changes were made to your test payment or saved conversations.</p><Link href="/introductory-preview/paid">Review your saved test conversations</Link></main>;
    }catch{
      return <main className="signup-shell"><h1>Private test dashboard temporarily unavailable</h1><p>Your test subscription and saved conversations are unchanged. Please try again later.</p><Link href="/introductory-preview/paid">Review the separate saved-history page</Link></main>;
    }
  }
  let allowed = false;
  try { allowed = await memberHasFitnessAccess(email, user.id); }
  catch {
    return <main className="signup-shell"><h1>Membership check unavailable</h1><p>Your existing membership and saved work are unchanged.</p><Link href="/dashboard">Try again</Link></main>;
  }
  if (!allowed) redirect("/fitness/login");
  let lifeAvailable = false;
  try { lifeAvailable = (await lifeTester()) === user.id; } catch {}
  return <main className={styles.shell}>
    <header className={styles.nav}><Link href="/dashboard" className={styles.brand}>AI Coach Directory</Link><nav aria-label="Member navigation"><a href="#coaches">Coaches</a><a href="#tools">My Tools</a><Link href="/manage-subscription">Account</Link></nav></header>
    <section className={styles.hero}><span>YOUR COACHING HOME</span><h1>Welcome back{user.firstName ? ", " + user.firstName : ""}.<br/>What will you work on today?</h1><p>One membership. Your coaches and personal tools in one place.</p></section>
    <section id="coaches" className={styles.section}><h2>Your Coaches</h2><div className={styles.cards}>
      <article className={styles.card}><Image src="/images/ai-coaching-for-fitness.jpg" alt="Fitness coaching" width={800} height={500}/><div><h3>Fitness Coach</h3><p>Build momentum with training that fits your life.</p><div className={styles.cardActions}><Link href="/fitness/chat">Open Fitness Coach</Link><Link href="/fitness/chat?view=workouts" className={styles.toolAction}>My Workouts</Link></div></div></article>
      <article className={styles.card}><Image src="/images/ai-coaching-for-budgeting.avif" alt="Budgeting coaching" width={800} height={500}/><div><h3>Budgeting Coach</h3><p>Plan your money and reach your financial goals.</p><div className={styles.cardActions}><Link href="/budgeting/launch?destination=coach">Open Budgeting Coach</Link><Link href="/budgeting/launch?destination=tracker" className={styles.toolAction}>My Budget</Link></div></div></article>
      <article className={styles.card}><Image src="/images/ai-coaching-for-life.jpg" alt="Life coaching" width={800} height={500}/><div><h3>Life Coach</h3><p>Find clarity, build habits, and move forward.</p>{lifeAvailable ? <div className={styles.cardActions}><Link href="/life">Open Life Coach</Link></div> : <span className={styles.pending}>Life Coach access is unavailable for this account</span>}</div></article>
    </div></section>
    <section id="tools" className={styles.section}><h2>Your Tools</h2><div className={styles.tools}><Link href="/fitness/chat?view=workouts"><strong>My Workouts</strong><span>Training plans and tracking</span></Link><Link href="/budgeting/launch?destination=tracker"><strong>My Budget</strong><span>Monthly budget and spending</span></Link></div></section>
    <footer className={styles.footer}><Link href="/manage-subscription">Manage Membership</Link></footer>
  </main>;
}

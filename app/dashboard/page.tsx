import Image from "next/image";
import Link from "next/link";
import {currentUser} from "@clerk/nextjs/server";
import {redirect} from "next/navigation";
import {memberHasFitnessAccess} from "@/lib/fitnessMembershipDb";
import {lifeTester} from "@/lib/lifeCoachAccess";
import styles from "./dashboard.module.css";
import { visibleMemberCoaches } from "@/lib/coachLaunchCatalog.mjs";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) redirect("/fitness/login");
  const primary = user.emailAddresses.find(item => item.id === user.primaryEmailAddressId);
  if (!primary || primary.verification?.status !== "verified") {
    return <main className="signup-shell"><h1>Verify your membership email</h1><Link href="/fitness/login">Member Login</Link></main>;
  }
  const email = primary.emailAddress.trim().toLowerCase();
  let allowed = false;
  try { allowed = await memberHasFitnessAccess(email, user.id); }
  catch {
    return <main className="signup-shell"><h1>Membership check unavailable</h1><p>Your existing membership and saved work are unchanged.</p><Link href="/dashboard">Try again</Link></main>;
  }
  if (!allowed) redirect("/fitness/login");
  let lifeAvailable = false;
  try { lifeAvailable = (await lifeTester()) === user.id; } catch {}
  const coaches = visibleMemberCoaches({lifeAvailable});
  return <main className={styles.shell}>
    <header className={styles.nav}><Link href="/dashboard" className={styles.brand}>AI Coach Directory</Link><nav aria-label="Member navigation"><a href="#coaches">Coaches</a><a href="#tools">My Tools</a><Link href="/manage-subscription">Account</Link></nav></header>
    <section className={styles.hero}><span>YOUR COACHING HOME</span><h1>Welcome back{user.firstName ? ", " + user.firstName : ""}.<br/>What will you work on today?</h1><p>One membership. Your coaches and personal tools in one place.</p></section>
    <section id="coaches" className={styles.section}><h2>Your Coaches</h2><div className={styles.cards}>
      {coaches.map(coach => <article key={coach.slug} className={styles.card}>
        <Image src={coach.image} alt={coach.imageAlt} width={800} height={500}/>
        <div><h3>{coach.title}</h3><p>{coach.description}</p>
          {coach.href && <div className={styles.cardActions}>
            <Link href={coach.href}>Open {coach.title}</Link>
            {coach.toolHref && coach.toolLabel && <Link href={coach.toolHref} className={styles.toolAction}>{coach.toolLabel}</Link>}
          </div>}
        </div>
      </article>)}
    </div></section>
    <section id="tools" className={styles.section}><h2>Your Tools</h2><div className={styles.tools}>
      {coaches.filter(coach=>coach.toolHref&&coach.toolLabel).map(coach=>
        <Link key={coach.slug} href={coach.toolHref!}>
          <strong>{coach.toolLabel}</strong><span>{coach.toolDescription}</span>
        </Link>)}
    </div></section>
    <footer className={styles.footer}><Link href="/manage-subscription">Manage Membership</Link></footer>
  </main>;
}

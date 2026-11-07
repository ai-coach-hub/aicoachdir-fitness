/**
 * Private PR #251 only: confirm isolated billing and Stripe test mode before
 * creating checkout or recording subscription state. Never use in production.
 */
import {neon} from "@neondatabase/serverless";
import {isolatedTrialPreviewEnabled} from "@/lib/isolatedIntroductoryIdentity";
import {stripeConfigured,stripeMode} from "@/lib/stripeServer";

export async function assertIsolatedTrialTestCheckout():Promise<void>{
 if(!isolatedTrialPreviewEnabled()||!stripeConfigured()||stripeMode()!=="test")
  throw Error("Test checkout unavailable");
 const url=process.env.STORAGE_URL||process.env.DATABASE_URL||process.env.POSTGRES_URL||"";
 if(!url)throw Error("Isolated billing database missing");
 const sql=neon(url);
 const rows=await sql`SELECT current_setting('neon.branch_id',true) AS branch`;
 if(String(rows[0]?.branch)!=="br-spring-cloud-aui2mogd")
  throw Error("Test billing database does not match the isolated trial");
}

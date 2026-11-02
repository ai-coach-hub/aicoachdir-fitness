/**
 * PR #251: isolated Clerk onboarding verification.
 * No paid member record is created, modified, or reconciled here.
 * Fails closed on missing billing records; never trusts browser eligibility.
 */
import {currentUser} from "@clerk/nextjs/server";
import {neon} from "@neondatabase/serverless";
import {sharedUsageMemberKey} from "./sharedUsageMemberIdentity";
import type {VerifiedTrialAccount} from "./isolatedIntroductoryExecution";
const TRIAL_REF="feature/intro-15-messages-isolated-20261101";
const TRIAL_NEON_BRANCH="br-spring-cloud-aui2mogd";
export function isolatedTrialPreviewEnabled(){
 return process.env.VERCEL_ENV==="preview" &&
 process.env.VERCEL_GIT_COMMIT_REF===TRIAL_REF &&
 process.env.INTRODUCTORY_TRIAL_PREVIEW_ENABLED==="true";
}
export async function resolveIsolatedIntroductoryAccount():Promise<(VerifiedTrialAccount & {verifiedEmail:string})|null>{
 if(!isolatedTrialPreviewEnabled())return null;
 const user=await currentUser();
 if(!user||!/^user_[A-Za-z0-9_-]{8,128}$/.test(user.id))return null;
 const primary=user.emailAddresses.find(e=>e.id===user.primaryEmailAddressId);
 if(!primary||primary.verification?.status!=="verified")return null;
 const email=primary.emailAddress.trim().toLowerCase();
 if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email))return null;
 const secret=String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||"").trim();
 const memberKey=sharedUsageMemberKey(email,secret);
 if(!memberKey)return null;
 // Use only the specifically configured isolated branch, never inherited STORAGE_URL.
 const url=process.env.INTRODUCTORY_TRIAL_DATABASE_URL;
 if(!url)return null;
 const db=neon(url);
 const branch=await db`SELECT current_setting('neon.branch_id',true) AS id`;
 if(String(branch[0]?.id)!==TRIAL_NEON_BRANCH)return null;
 // A cloned billing row is not proof of *absence* from historical Stripe/Pickaxe.
 // Require an independently maintained allowlist of synthetic preview identities.
 const allowed=String(process.env.INTRODUCTORY_TRIAL_TEST_CLERK_IDS||"")
   .split(",").map(x=>x.trim()).filter(Boolean);
 const dedicatedTester=String(process.env.INTRODUCTORY_TRIAL_DEDICATED_TEST_CLERK_ID||"").trim();
 if(!allowed.includes(user.id)&&user.id!==dedicatedTester)return null;
 const records=await db`SELECT clerk_user_id,stripe_customer_id,stripe_subscription_id,
    stripe_status,access_active FROM public.fitness_memberships WHERE email=${email} LIMIT 1`;
 if(records.length!==0)return null; // Never overwrite/bypass any existing subscriber.
 return {clerkUserId:user.id,memberKey,verifiedEmail:email,emailVerified:true,
         existingPaidOrLegacyMember:false,previouslyGranted:false};
}

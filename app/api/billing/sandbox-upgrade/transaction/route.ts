import {currentUser} from "@clerk/nextjs/server";
import {NextResponse} from "next/server";
import {sandboxUpgradeTransaction} from "@/lib/sandboxUpgradeStripeTransaction";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(req:Request){
 if(process.env.VERCEL_ENV!=="preview"||
  process.env.VERCEL_GIT_COMMIT_REF!=="feature/verified-subscription-upgrade-policy-20261027"||
  process.env.UPGRADE_SANDBOX_MEMBER_UPGRADES_ENABLED!=="true")
  return NextResponse.json({error:"not_found"},{status:404});
 const origin=req.headers.get("origin");
 if(!origin||origin!==new URL(req.url).origin)
  return NextResponse.json({error:"invalid_origin"},{status:403});
 const user=await currentUser();
 const primary=user?.emailAddresses.find(x=>x.id===user.primaryEmailAddressId);
 if(!user||!primary||primary.verification?.status!=="verified")
  return NextResponse.json({error:"auth_required"},{status:401});
 let value:unknown;
 try{value=await req.json()}catch{return NextResponse.json({error:"invalid_json"},{status:400})}
 const body=value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
 if(!["quote","confirm"].includes(String(body.action))||
 typeof body.intentId!=="string"||
 (body.action==="confirm"&&(!Number.isSafeInteger(body.expectedAmountCents)||
 Number(body.expectedAmountCents)<=0)))
  return NextResponse.json({error:"invalid_request"},{status:400});
 try{
  const result=await sandboxUpgradeTransaction({
   action:body.action as "quote"|"confirm",intentId:body.intentId,
   clerkUserId:user.id,verifiedEmail:primary.emailAddress.trim().toLowerCase(),
   expectedAmountCents:body.action==="confirm"?Number(body.expectedAmountCents):undefined
  });
  return NextResponse.json(result,{status:result.ok?200:409});
 }catch{
  // Deliberately hide billing/DB detail on ambiguous outcomes.
  return NextResponse.json({error:"operator_review_required"},{status:503});
 }
}

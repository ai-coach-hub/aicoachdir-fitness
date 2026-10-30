import {currentUser} from "@clerk/nextjs/server";
import {NextResponse} from "next/server";
import {executePreparedSandboxUpgrade} from "@/lib/executePreparedSandboxUpgrade";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:Request){
 if(process.env.VERCEL_ENV!=="preview"||
  process.env.UPGRADE_SANDBOX_MEMBER_UPGRADES_ENABLED!=="true"||
  process.env.VERCEL_GIT_COMMIT_REF!=="feature/verified-subscription-upgrade-policy-20261027")
  return NextResponse.json({error:"not_found"},{status:404});
 if(req.headers.get("origin")!==new URL(req.url).origin)
  return NextResponse.json({error:"invalid_origin"},{status:403});
 const user=await currentUser();
 const email=user?.emailAddresses.find(e=>e.id===user.primaryEmailAddressId);
 if(!user||!email||email.verification?.status!=="verified")
  return NextResponse.json({error:"auth_required"},{status:401});
 let value:unknown;try{value=await req.json()}catch{return NextResponse.json({error:"invalid_json"},{status:400})}
 const body=value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
 if(typeof body.intentId!=="string")return NextResponse.json({error:"invalid_intent"},{status:400});
 try{
  const result=await executePreparedSandboxUpgrade({
   intentId:body.intentId,clerkUserId:user.id,
   verifiedEmail:email.emailAddress.trim().toLowerCase()});
  return NextResponse.json(result,{status:result.ok?200:409});
 }catch{return NextResponse.json({error:"retry_later"},{status:503})}
}

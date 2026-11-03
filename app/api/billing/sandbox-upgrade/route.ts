import {currentUser} from "@clerk/nextjs/server";
import {NextResponse} from "next/server";
import {prepareSandboxMemberUpgrade} from "@/lib/prepareSandboxMemberUpgrade";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(req:Request){
 if(process.env.VERCEL_ENV!=="preview"||
 process.env.UPGRADE_SANDBOX_MEMBER_UPGRADES_ENABLED!=="true"||
 process.env.VERCEL_GIT_COMMIT_REF!=="feature/verified-subscription-upgrade-policy-20261027")
 return NextResponse.json({error:"not_found"},{status:404});
 const origin=req.headers.get("origin"),site=new URL(req.url).origin;
 if(origin!==site)return NextResponse.json({error:"invalid_origin"},{status:403});
 const user=await currentUser();
 const primary=user?.emailAddresses.find(x=>x.id===user.primaryEmailAddressId);
 if(!user||!primary||primary.verification?.status!=="verified")
 return NextResponse.json({error:"auth_required"},{status:401});
 let value:unknown;try{value=await req.json()}catch{return NextResponse.json({error:"invalid_json"},{status:400})}
 const body=value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
 if(typeof body.targetTier!=="string")
 return NextResponse.json({error:"invalid_tier"},{status:400});
 try{
 const result=await prepareSandboxMemberUpgrade({
 clerkUserId:user.id,verifiedEmail:primary.emailAddress.trim().toLowerCase(),
 targetTier:body.targetTier});
 return NextResponse.json(result,{status:result.ok?200:409});
 }catch{return NextResponse.json({error:"upgrade_unavailable"},{status:503})}
}

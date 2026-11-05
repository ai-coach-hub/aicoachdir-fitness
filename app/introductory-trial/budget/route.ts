import {currentUser} from "@clerk/nextjs/server";
import {NextResponse} from "next/server";
import {assessVerifiedPublicTrialUser,isPublicTrialPreflightAvailable} from "@/lib/publicIntroductoryTrialPreflight";
import {trialBudgetHandoffSignature} from "@/lib/publicTrialBudgetSigning";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 if(!isPublicTrialPreflightAvailable())return new Response(null,{status:404});
 const user=await currentUser();
 const primary=user?.emailAddresses.find(e=>e.id===user.primaryEmailAddressId);
 if(!user||primary?.verification?.status!=="verified")
  return NextResponse.redirect(new URL("/introductory-trial/chat",request.url));
 try{
  const admission=await assessVerifiedPublicTrialUser(user.id);
  if(admission.kind!=="resume")return NextResponse.redirect(new URL("/introductory-trial/chat",request.url));
  const email=primary.emailAddress.trim().toLowerCase();
  const expires=String(Date.now()+90_000);
  const destination=new URL(request.url).searchParams.get("destination")==="coach"?"coach":"tracker";
  const url=new URL("/budget/trial/access",request.url);
  url.searchParams.set("destination",destination);
  url.searchParams.set("email",email);
  url.searchParams.set("clerk",user.id);
  url.searchParams.set("expires",expires);
  url.searchParams.set("signature",trialBudgetHandoffSignature(email,user.id,expires));
  return NextResponse.redirect(url,{headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
 }catch{return new Response("Introductory Budgeting access temporarily unavailable.",{status:503,headers:{"Cache-Control":"no-store"}});}
}

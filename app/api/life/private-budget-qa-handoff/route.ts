import {createHmac} from "node:crypto";
import {currentUser} from "@clerk/nextjs/server";
import {lifeTester} from "@/lib/lifeCoachAccess";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const denied=()=>new Response("Private QA handoff unavailable",{status:404,headers:{"Cache-Control":"no-store"}});
export async function GET(request:Request){
 if(process.env.VERCEL_ENV!=="preview"||
    process.env.VERCEL_GIT_COMMIT_REF!=="feature/life-coach-agent-sandbox-20261011"||
    process.env.PREVIEW_SHARED_USAGE_METER_ENABLED!=="true")return denied();
 if(!(await lifeTester()))return denied();
 const user=await currentUser();
 const primary=user?.emailAddresses.find(x=>x.id===user.primaryEmailAddressId);
 if(!primary||primary.verification?.status!=="verified")return denied();
 const email=primary.emailAddress.trim().toLowerCase();
 const secret=String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||"").trim();
 if(secret.length<32)return denied();
 const target=new URL(request.url).searchParams.get("target")||"";
 let origin:URL;
 try{origin=new URL(target);}catch{return denied();}
 if(origin.protocol!=="https:"||origin.pathname!=="/"||origin.search||origin.hash||
    !/^aicoachdir-budgeting-[a-z0-9-]+-kcb3\.vercel\.app$/.test(origin.hostname))return denied();
 const expires=String(Date.now()+120000);
 const signature=createHmac("sha256",secret)
   .update(["private-qa-handoff-v1",email,expires].join("\n")).digest("hex");
 const destination=new URL("/private-qa-handoff",origin);
 destination.searchParams.set("email",email);
 destination.searchParams.set("expires",expires);
 destination.searchParams.set("signature",signature);
 return new Response(null,{status:302,headers:{Location:destination.toString(),
  "Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
}

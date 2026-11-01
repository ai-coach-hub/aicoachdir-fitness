import {NextResponse} from "next/server";
import {preflightTierChange} from "@/lib/productionTierChangePreflight";
export const runtime="nodejs";
export const dynamic="force-dynamic";

/**
 * Read-only, future tier-change eligibility endpoint.
 * This endpoint never updates Stripe, invoices, schedules, or allowances.
 * The customer-facing feature switch remains disabled in production.
 */
export async function POST(request:Request){
 const origin=new URL(request.url).origin;
 if(request.headers.get("origin")!==origin)
   return NextResponse.json({ok:false,reason:"invalid_origin"},{status:403});
 if(request.headers.get("content-type")?.split(";")[0]?.trim()!=="application/json")
   return NextResponse.json({ok:false,reason:"invalid_content_type"},{status:415});
 // Never parse a request or perform member lookups while the feature is off.
 if(process.env.PUBLIC_TIER_UPGRADES_ENABLED!=="true")
   return NextResponse.json({ok:false,reason:"tier_changes_disabled"},{status:403});
 let body:unknown;
 try{body=await request.json();}catch{
   return NextResponse.json({ok:false,reason:"invalid_request"},{status:400});
 }
 if(!body||typeof body!=="object"||Array.isArray(body))
   return NextResponse.json({ok:false,reason:"invalid_request"},{status:400});
 try{
   const result=await preflightTierChange((body as Record<string,unknown>).targetTier);
   return NextResponse.json(result,{status:result.ok?200:403});
 }catch{
   return NextResponse.json({ok:false,reason:"preflight_unavailable"},{status:503});
 }
}

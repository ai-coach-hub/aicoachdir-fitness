import {NextResponse} from "next/server";
import {prepareTierChange} from "@/lib/tierChangeService";
import {tierChangesEnabled} from "@/lib/tierChangeRuntime";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:Request){
 const origin=new URL(req.url).origin;
 if(req.headers.get("origin")!==origin)return NextResponse.json({ok:false,reason:"invalid_origin"},{status:403});
 if(!tierChangesEnabled())
 return NextResponse.json({ok:false,reason:"disabled"},{status:404});
 if(req.headers.get("content-type")?.split(";")[0]?.trim()!=="application/json")
 return NextResponse.json({ok:false,reason:"invalid_content_type"},{status:415});
 let body:unknown;
 try{body=await req.json();}catch{return NextResponse.json({ok:false,reason:"invalid_request"},{status:400});}
 if(!body||typeof body!=="object"||Array.isArray(body))
 return NextResponse.json({ok:false,reason:"invalid_request"},{status:400});
 try{
 const outcome=await prepareTierChange((body as Record<string,unknown>).targetTier);
 return NextResponse.json(outcome,{status:outcome.ok?200:403});
 }catch{
 return NextResponse.json({ok:false,reason:"billing_unavailable"},{status:503});
 }
}

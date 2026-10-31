import {NextResponse} from 'next/server';
import {tierChangesEnabled} from '@/lib/tierChangeRuntime';
import {quoteTierChange,confirmTierChange} from '@/lib/tierChangeService';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 if(req.headers.get('origin')!==new URL(req.url).origin)return NextResponse.json({ok:false,reason:'invalid_origin'},{status:403});
 if(!tierChangesEnabled())return NextResponse.json({ok:false,reason:'disabled'},{status:404});
 if(req.headers.get('content-type')?.split(';')[0]!=='application/json')return NextResponse.json({ok:false,reason:'invalid_content_type'},{status:415});
 let body;try{body=await req.json();}catch{return NextResponse.json({ok:false,reason:'invalid_request'},{status:400});}
 if(!body||!['quote','confirm'].includes(body.action))return NextResponse.json({ok:false,reason:'invalid_request'},{status:400});
 try{return NextResponse.json(await (body.action==='quote'?quoteTierChange(body.intentId):confirmTierChange(body.intentId,body.expectedAmountCents)));}
 catch(e){console.error('[tier-change]',e instanceof Error?e.message:'unavailable');return NextResponse.json({ok:false,reason:'We could not confirm this change. Refresh to check its status before trying again.'},{status:409});}
}

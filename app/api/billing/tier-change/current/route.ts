import {NextResponse} from 'next/server';
import {tierChangesEnabled} from '@/lib/tierChangeRuntime';
import {tierChangeStatus} from '@/lib/tierChangeService';
export const dynamic='force-dynamic';
export async function GET(){
 if(!tierChangesEnabled())return NextResponse.json({ok:false,reason:'disabled'},{status:404});
 try{return NextResponse.json(await tierChangeStatus());}
 catch{return NextResponse.json({ok:false,reason:'Sign in with your verified member account to manage plans.'},{status:403});}
}

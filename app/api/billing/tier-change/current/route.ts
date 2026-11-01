import {NextResponse} from 'next/server';
import {tierChangesEnabled} from '@/lib/tierChangeRuntime';
import {tierChangeStatus} from '@/lib/tierChangeService';
export const dynamic='force-dynamic';
export async function GET(){
 if(!tierChangesEnabled())return NextResponse.json({ok:false,reason:'disabled'},{status:404});
 try{return NextResponse.json(await tierChangeStatus());}
 catch(error){
  console.error('[tier-change-current] status-failed',{
   message:error instanceof Error?error.message:String(error),
  });
  return NextResponse.json({ok:false,reason:'We could not load your plan details right now. Your subscription has not changed.'},{status:403});
 }
}

import {createHmac,timingSafeEqual} from "node:crypto";

// Read-only production service authentication check. This endpoint NEVER
// accesses memberships, Stripe, Pickaxe, or the usage ledger.
// Budgeting performs this check at build time before activating a new build.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply=(body:unknown,status=200)=>Response.json(body,{
 status,headers:{"Cache-Control":"no-store"}
});
type Probe={version:1;audience:"aicoachdir-signature-probe";actor:"budgeting";nonce:string;issuedAt:number};
export async function POST(request:Request){
 if(process.env.VERCEL_ENV!=="production")
  return reply({ok:false},404);
 let body:unknown;
 try{body=await request.json();}catch{return reply({ok:false},400);}
 if(!body||typeof body!=="object"||Array.isArray(body))
  return reply({ok:false},400);
 const p=body as Record<string,unknown>;
 const props=Object.keys(p).sort().join(",");
 const secret=String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||"").trim();
 const now=Date.now();
 if(props!=="actor,audience,issuedAt,nonce,version"||
    p.version!==1||p.audience!=="aicoachdir-signature-probe"||
    p.actor!=="budgeting"||typeof p.nonce!=="string"||
    !/^[0-9a-f]{32}$/.test(p.nonce)||
    !Number.isSafeInteger(p.issuedAt)||
    (p.issuedAt as number)>now+30_000||(p.issuedAt as number)<now-90_000||
    secret.length<32)return reply({ok:false},401);
 const supplied=request.headers.get("x-shared-usage-probe-signature")||"";
 if(!/^[0-9a-f]{64}$/.test(supplied))return reply({ok:false},401);
 const canon="aicoachdir-readonly-auth-v1\n"+JSON.stringify([
  (p as Probe).version,(p as Probe).audience,(p as Probe).actor,
  (p as Probe).nonce,(p as Probe).issuedAt
 ]);
 const expected=createHmac("sha256",secret).update(canon).digest();
 const actual=Buffer.from(supplied,"hex");
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))
  return reply({ok:false},401);
 return reply({ok:true,mode:"read-only",verified:"shared-service-signing"});
}

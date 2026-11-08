/**
 * Preview-only, read-only check of the Fitness Pickaxe API/MCP deployment.
 * Never submits a completion, exposes a token/ID, or touches a wallet.
 * An absent match points to an incorrect deployment ID or workspace mismatch.
 */
import {isolatedTrialPreviewEnabled} from "@/lib/isolatedIntroductoryIdentity";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const reply=(result:unknown,status=200)=>Response.json(result,{
 status,headers:{"Cache-Control":"private, no-store","X-Robots-Tag":"noindex"}
});

export async function GET(){
 if(!isolatedTrialPreviewEnabled())return reply({ok:false},404);
 const configured=String(process.env.PICKAXE_FITNESS_COACH_DEPLOYMENT_ID||"").trim();
 const workspaceToken=String(process.env.PICKAXE_WORKSPACE_API_TOKEN||"").trim();
 if(!configured||!workspaceToken)
  return reply({ok:false,mode:"isolated-preview",readOnly:true,
   status:"required_configuration_missing"},503);
 if(!configured.startsWith("deployment-"))
  return reply({ok:false,mode:"isolated-preview",readOnly:true,
   status:"not_a_deployment_id"},200);
 try{
  // Studio API credentials are workspace-scoped; completions use deployment ID.
  // Only metadata is read. No model or Action execution occurs.
  const response=await fetch("https://api.pickaxe.co/v1/studio/deployment/list",{
   method:"GET",
   headers:{"Authorization":`Bearer ${workspaceToken}`,"Accept":"application/json"},
   cache:"no-store",signal:AbortSignal.timeout(10000)
  });
  if(!response.ok)return reply({ok:false,mode:"isolated-preview",readOnly:true,
   status:"workspace_list_unavailable",upstreamStatus:response.status},503);
  const parsed:unknown=await response.json();
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))
   return reply({ok:false,mode:"isolated-preview",readOnly:true,
    status:"invalid_workspace_response"},503);
  const payload=parsed as {success?:boolean;data?:unknown};
  if(payload.success===false||!Array.isArray(payload.data))
   return reply({ok:false,mode:"isolated-preview",readOnly:true,
    status:"invalid_workspace_response"},503);
  const records=payload.data.filter((item):item is Record<string,unknown>=>
   !!item&&typeof item==="object"&&!Array.isArray(item));
  const matching=records.filter(item=>item.deploymentId===configured);
  if(matching.length!==1)
   return reply({ok:false,mode:"isolated-preview",readOnly:true,
    status:"configured_fitness_deployment_not_found_in_workspace"});
  const isApi=matching[0].type==="api";
  return reply({ok:isApi,mode:"isolated-preview",readOnly:true,
   status:isApi?"fitness_api_deployment_found":"fitness_deployment_wrong_type"});
 }catch{return reply({ok:false,mode:"isolated-preview",readOnly:true,
   status:"workspace_list_unavailable"},503);}
}

/**
 * One safe registry for member dashboard coach cards. No secrets, price IDs,
 * billing changes or auto-provisioning. New coaches remain disabled until
 * all launch gates pass and their routes exist.
 */
export const COACH_CATALOG = Object.freeze([
  Object.freeze({
    slug:"fitness", title:"Fitness Coach",
    description:"Build momentum with training that fits your life.",
    image:"/images/ai-coaching-for-fitness.jpg", imageAlt:"Fitness coaching",
    href:"/fitness/chat", toolHref:"/fitness/chat?view=workouts",
    toolLabel:"My Workouts", toolDescription:"Training plans and tracking",
    availability:"member", releaseGate:"existing", history:"pickaxe", metering:"existing-shared",
  }),
  Object.freeze({
    slug:"budgeting",title:"Budgeting Coach",
    description:"Plan your money and reach your financial goals.",
    image:"/images/ai-coaching-for-budgeting.avif",imageAlt:"Budgeting coaching",
    href:"/budgeting/launch?destination=coach", toolHref:"/budgeting/launch?destination=tracker",
    toolLabel:"My Budget",toolDescription:"Monthly budget and spending",
    availability:"member",releaseGate:"existing",history:"budget-store",metering:"external-handoff",
  }),
  Object.freeze({
    slug:"life",title:"Life Coach",
    description:"Find clarity, build habits, and move forward.",
    image:"/images/ai-coaching-for-life.jpg",imageAlt:"Life coaching",
    href:"/life",toolHref:null,
    toolLabel:null,toolDescription:null,
    availability:"member",releaseGate:"life-existing",history:"life-store",metering:"existing-shared",
  }),
  Object.freeze({
    slug:"career",title:"Career Coach",
    description:"Prepare for your next professional step.",
    image:"/images/ai-coaching-for-career.jpg",imageAlt:"Career coaching",
    href:null,toolHref:null,toolLabel:null,toolDescription:null,
    availability:"unreleased",releaseGate:"never",history:"unconfigured",metering:"unconfigured",
  }),
]);
const knownAvailability=new Set(["member","unreleased"]);
const knownGates=new Set(["existing","life-existing","never"]);
export function catalogValid(catalog=COACH_CATALOG){
 if(!Array.isArray(catalog)||catalog.length===0)return false;
 const seen=new Set();
 for(const c of catalog){
  if(!c||!(/^[a-z][a-z0-9-]*$/.test(c.slug))||seen.has(c.slug)||
    !knownAvailability.has(c.availability)||!knownGates.has(c.releaseGate)||
    typeof c.title!=="string"||!c.title.trim()||typeof c.description!=="string"||
    !/^\/images\/[a-z0-9.\-]+$/.test(c.image||"")||
    typeof c.imageAlt!=="string"||!c.imageAlt.trim())return false;
  seen.add(c.slug);
  if(c.availability==="unreleased" && (c.href!==null||c.toolHref!==null||c.releaseGate!=="never"))return false;
  if(c.availability==="member" &&
     (typeof c.href!=="string"||!c.href.startsWith("/")||c.href.startsWith("//")||
      (c.toolHref!==null&&(typeof c.toolHref!=="string"||!c.toolHref.startsWith("/")||c.toolHref.startsWith("//")))||
      (c.toolHref!==null&&(typeof c.toolLabel!=="string"||!c.toolLabel.trim()))||
      (c.toolHref===null&&c.toolLabel!==null)))return false;
 }
 return true;
}
/** A preview or released coach is never allowed solely by registry registration. */
export function visibleMemberCoaches({lifeAvailable=false}={}){
 if(!catalogValid())return [];
 return COACH_CATALOG.filter(c=>c.availability==="member" &&
  (c.releaseGate==="existing"||(c.releaseGate==="life-existing"&&lifeAvailable===true)));
}
export function availableCoachBySlug(slug,options={}){
 return visibleMemberCoaches(options).find(c=>c.slug===slug)||null;
}

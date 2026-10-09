const normalize = x => typeof x === "string" ? x.trim().toLowerCase() : "";
const id = (x,prefix) => typeof x === "string" && x.startsWith(prefix) && /^[a-zA-Z0-9_]+$/.test(x);
const record = x => x && typeof x === "object" && !Array.isArray(x) ? x : {};
export function extractPickaxeIdentity(payload) {
  const p=record(record(payload).data || payload);
  const email=normalize(p.email);
  const userId=String(p.id || p._id || "").trim();
  if (!email || !email.includes("@") || !userId || !/^[a-zA-Z0-9_-]+$/.test(userId)) return null;
  return {email,id:userId};
}
export function decideBillingIdentity({email,clerkUserId,customers,subscriptions,pickaxe,studioId,now=Math.floor(Date.now()/1000)}) {
  const e=normalize(email);
  if (!e || !clerkUserId || !Array.isArray(customers) || !Array.isArray(subscriptions)) return {outcome:"unlinked"};
  if (customers.length !== 1) return {outcome:customers.length ? "ambiguous":"unlinked"};
  const customer=customers[0];
  if (!id(customer?.id,"cus_") || normalize(customer.email)!==e) return {outcome:"unlinked"};
  const active=subscriptions.filter(s=>{
    if (!s || s.customerId!==customer.id || !id(s.subscriptionId,"sub_")) return false;
    if (s.status!=="active" && s.status!=="trialing") return false;
    if (s.cancelAtPeriodEnd && Number.isFinite(s.currentPeriodEnd) && now>=s.currentPeriodEnd) return false;
    return true;
  });
  if(active.length!==1) return {outcome:active.length ? "ambiguous":"unlinked"};
  const s=active[0],m=record(s.metadata);
  const website=s.source==="website" && normalize(m.member_email)===e && m.clerk_user_id===clerkUserId;
  const legacy=s.source==="pickaxe" && typeof studioId==="string" && studioId.length>0
    && String(m.studioId||"")===studioId
    && normalize(pickaxe?.email)===e
    && typeof pickaxe?.id==="string" && pickaxe.id.length>0
    && pickaxe.id===m.studioUserId;
  if (!website && !legacy) return {outcome:"unlinked"};
  return {outcome:"linked",customerId:customer.id,subscriptionId:s.subscriptionId,source:s.source};
}

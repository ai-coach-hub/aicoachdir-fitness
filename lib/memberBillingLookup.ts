import { getFitnessMembership } from "@/lib/fitnessMembershipDb";
import { getPickaxeUser } from "@/lib/pickaxeAccess";
import { stripeConfigured, stripeRequest } from "@/lib/stripeServer";
import { decideBillingIdentity, extractPickaxeIdentity } from "@/lib/memberBillingIdentityCore.mjs";

const EXPECTED_STUDIO_ID = "STUDIOFEB9DXAKH9BA0QAXYBA6";
type StripeRecord = Record<string, unknown>;
const obj = (v: unknown): StripeRecord => v && typeof v === "object" && !Array.isArray(v) ? v as StripeRecord : {};
const array = (v: unknown): StripeRecord[] => Array.isArray(v) ? v.filter(x=>x && typeof x==="object" && !Array.isArray(x)) as StripeRecord[] : [];

export type BillingCustomerResolution =
  | { outcome: "linked"; customerId: string; subscriptionId: string; source: string }
  | { outcome: "unlinked" | "ambiguous" | "unavailable" };

export async function resolveMemberBillingCustomer(email: string, clerkUserId: string): Promise<BillingCustomerResolution> {
  if (!email || !clerkUserId || !stripeConfigured()) return { outcome: "unavailable" };
  const normalizedEmail = email.trim().toLowerCase();
  try {
    const membership = await getFitnessMembership(normalizedEmail);
    // The site membership does not authorize portal access by itself.
    // Read the current payment provider records and verify identity before issuing a session.
    const query = `email:'${normalizedEmail.replace(/'/g, "")}'`;
    const customersResult = await stripeRequest(`/customers/search?query=${encodeURIComponent(query)}&limit=100`);
    const customers = array(customersResult.data)
      .filter(c => String(c.email || "").trim().toLowerCase() === normalizedEmail)
      .map(c => ({ id: String(c.id || ""), email: String(c.email || "") }));
    if (customers.length !== 1) return {outcome: customers.length ? "ambiguous" : "unlinked"};

    const customerId = customers[0].id;
    if (!/^cus_[a-zA-Z0-9_]+$/.test(customerId)) return {outcome:"unlinked"};
    if (customersResult.has_more) return { outcome: "ambiguous" };
    const subscriptionResult = await stripeRequest(`/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=100`);
    if (subscriptionResult.has_more) return { outcome: "ambiguous" };

    const subscriptions = array(subscriptionResult.data).map(s => {
      const meta = obj(s.metadata);
      const items = array(obj(s.items).data);
      const firstPeriodEnd = Number(items[0]?.current_period_end ?? s.current_period_end ?? NaN);
      const source = meta.member_email && meta.clerk_user_id ? "website" : "pickaxe";
      return {
        customerId: String(s.customer || ""),
        subscriptionId: String(s.id || ""),
        status: String(s.status || ""),
        cancelAtPeriodEnd: s.cancel_at_period_end === true,
        currentPeriodEnd: firstPeriodEnd,
        source,
        metadata: meta,
      };
    });

    // Only contact Pickaxe if the candidate belongs to its exact known studio.
    let pickaxe: {email:string;id:string}|null = null;
    if (subscriptions.some(s => s.source === "pickaxe" && s.metadata.studioId === EXPECTED_STUDIO_ID)) {
      const result = await getPickaxeUser(normalizedEmail, {fallbackToList:false});
      pickaxe = extractPickaxeIdentity(result);
    }
    const outcome = decideBillingIdentity({
      email: normalizedEmail,
      clerkUserId,
      customers,
      subscriptions,
      pickaxe,
      studioId: EXPECTED_STUDIO_ID,
    });
    if (outcome.outcome !== "linked") return {outcome:outcome.outcome};
    if (!outcome.customerId || !outcome.subscriptionId) return {outcome:"unlinked"};
    // A Stripe-paid website member must agree with the customer's locally stored ownership.
    if (outcome.source === "website" && (
      String(membership?.stripe_customer_id || "") !== outcome.customerId ||
      String(membership?.stripe_subscription_id || "") !== outcome.subscriptionId
    )) return {outcome:"ambiguous"};
    return {outcome:"linked",customerId:outcome.customerId,subscriptionId:outcome.subscriptionId,source:outcome.source};
  } catch (err) {
    console.error("[member-billing-lookup] verification unavailable", err instanceof Error ? err.name : "unknown");
    return {outcome:"unavailable"};
  }
}

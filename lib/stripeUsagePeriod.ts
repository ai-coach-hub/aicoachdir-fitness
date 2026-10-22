// Pure Stripe billing-period extraction for future server-only shared AI metering.
// No Stripe request, access grant, billing mutation or production integration.
// Stripe 2025-03-31.basil+ exposes current periods on subscription ITEMS.
// Older Stripe responses may expose them on the subscription itself.
type Obj = Record<string, unknown>;
const object = (value: unknown): Obj | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Obj : null;
const stripeId = (value: unknown, prefix: string) =>
  typeof value === "string" &&
  new RegExp("^" + prefix + "_[A-Za-z0-9]+$").test(value);
const seconds = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) &&
  value > 0 && value <= 253402300799 ? value : null;
const windowValue = (value: Obj): [number,number] | null => {
  const start = seconds(value.current_period_start);
  const end = seconds(value.current_period_end);
  return start !== null && end !== null && end > start &&
    end - start <= 35 * 24 * 60 * 60 ? [start,end] : null;
};
const hasWindowField = (value: Obj) =>
  "current_period_start" in value || "current_period_end" in value;

export type StripeUsageWindow =
  | {ok:true; periodStart:string; periodEnd:string; priceId:string}
  | {ok:false; reason:"invalid_subscription" | "unapproved_price" |
      "ambiguous_items" | "invalid_billing_period" | "conflicting_billing_period"};

export function stripeUsageWindowFromVerifiedRecord(
  value: unknown,
  expected: {customerId:string;subscriptionId:string;priceId:string}
): StripeUsageWindow {
  const sub = object(value);
  if (!sub ||
      !stripeId(expected.customerId,"cus") ||
      !stripeId(expected.subscriptionId,"sub") ||
      !stripeId(expected.priceId,"price") ||
      sub.id !== expected.subscriptionId ||
      sub.customer !== expected.customerId)
    return {ok:false,reason:"invalid_subscription"};

  const items = object(sub.items);
  if (!items || items.has_more === true || !Array.isArray(items.data) ||
      items.data.length !== 1)
    return {ok:false,reason:"ambiguous_items"};
  const item = object(items.data[0]);
  const price = object(item?.price);
  if (!item || !price || price.id !== expected.priceId)
    return {ok:false,reason:"unapproved_price"};
  const recurring = object(price.recurring);
  if (!recurring || recurring.interval !== "month" ||
      recurring.interval_count !== 1)
    return {ok:false,reason:"unapproved_price"};

  const modern = hasWindowField(item);
  const legacy = hasWindowField(sub);
  const onItem = modern ? windowValue(item) : null;
  const onParent = legacy ? windowValue(sub) : null;
  if ((modern && !onItem) || (legacy && !onParent) ||
      (!modern && !legacy))
    return {ok:false,reason:"invalid_billing_period"};
  if (onItem && onParent &&
      (onItem[0] !== onParent[0] || onItem[1] !== onParent[1]))
    return {ok:false,reason:"conflicting_billing_period"};
  const [start,end] = (onItem || onParent)!;
  return {
    ok:true, periodStart:new Date(start * 1000).toISOString(),
    periodEnd:new Date(end * 1000).toISOString(),
    priceId:expected.priceId,
  };
}

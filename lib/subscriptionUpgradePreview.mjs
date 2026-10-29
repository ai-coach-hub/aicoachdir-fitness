// Server-only, read-only Stripe quote builder. Never authorizes a charge.
export function buildUpgradePreviewRequest(plan, prorationDate) {
  if (!plan?.ok || plan.action !== "upgrade" || !plan.requiresBillingPreview ||
      !/^sub_[A-Za-z0-9]+$/.test(String(plan.subscriptionId || "")) ||
      !/^si_[A-Za-z0-9]+$/.test(String(plan.subscriptionItemId || "")) ||
      !/^price_[A-Za-z0-9]+$/.test(String(plan.targetPriceId || "")) ||
      !Number.isSafeInteger(prorationDate) || prorationDate <= 0) {
    throw new Error("Unverified upgrade cannot be quoted.");
  }
  const form = new URLSearchParams();
  form.set("subscription", plan.subscriptionId);
  form.set("subscription_details[items][0][id]", plan.subscriptionItemId);
  form.set("subscription_details[items][0][price]", plan.targetPriceId);
  form.set("subscription_details[items][0][quantity]", "1");
  form.set("subscription_details[proration_behavior]", "always_invoice");
  form.set("subscription_details[proration_date]", String(prorationDate));
  return form;
}
export function summarizeUpgradePreview(invoice) {
  if (!invoice || invoice.object !== "invoice" ||
      !String(invoice.id || "").startsWith("upcoming_in_") ||
      invoice.currency !== "usd" ||
      !Number.isSafeInteger(invoice.amount_due) || invoice.amount_due < 0 ||
      !Array.isArray(invoice.lines?.data)) {
    throw new Error("Unexpected Stripe preview.");
  }
  const prorations = invoice.lines.data.filter(line =>
    line?.parent?.subscription_item_details?.proration === true);
  if (prorations.length < 2 ||
      prorations.some(line => !Number.isSafeInteger(line.amount))) {
    throw new Error("No complete proration quote was returned.");
  }
  return Object.freeze({
    amountDueCents: invoice.amount_due,
    currency: "usd",
    prorationNetCents: prorations.reduce((sum,line) => sum + line.amount, 0),
    creditCents: prorations.filter(x=>x.amount<0).reduce((sum,x)=>sum+x.amount,0),
    chargeCents: prorations.filter(x=>x.amount>0).reduce((sum,x)=>sum+x.amount,0),
    estimated: true,
  });
}

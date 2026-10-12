import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";
import { readFile } from "node:fs/promises";

async function loadModule(path, dependencies) {
  const source = await readFile(new URL("../" + path, import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const mod = { exports };
  vm.runInNewContext(javascript, {
    require(name) {
      if (!(name in dependencies)) throw new Error("Unexpected import: " + name);
      return dependencies[name];
    },
    exports,
    module: mod,
    URLSearchParams,
    console,
  }, { timeout: 2000, filename: path });
  return mod.exports;
}

async function stripeLifecycle(stripeRequest) {
  return loadModule("lib/stripeMembershipState.ts", {
    "@/lib/stripeServer": {
      stripeRequest,
      stripeSubscriptionIsActive: (state) => state === "active" || state === "trialing",
    },
  });
}

test("subscription states distinguish paid, scheduled cancellation, recoverable and ended", async () => {
  const mod = await stripeLifecycle(async () => ({}));
  assert.equal(mod.classifyStripeSubscription({ status: "active" }), "active");
  assert.equal(mod.classifyStripeSubscription({ status: "active", cancel_at_period_end: true }), "canceling");
  assert.equal(mod.classifyStripeSubscription({ status: "past_due" }), "recoverable");
  assert.equal(mod.classifyStripeSubscription({ status: "unpaid" }), "recoverable");
  assert.equal(mod.classifyStripeSubscription({ status: "canceled" }), "canceled");
  assert.equal(mod.classifyStripeSubscription({ status: "incomplete_expired" }), "canceled");
});

async function simulateCheckoutRisk(statuses, options = {}) {
  const customers = statuses.map((_, i) => ({ id: "cus_TEST" + i, email: "member@example.com" }));
  const mod = await stripeLifecycle(async (path) => {
    if (path.startsWith("/customers?")) return {
      data: customers,
      has_more: Boolean(options.moreCustomers),
    };
    if (path.startsWith("/subscriptions?")) {
      const id = /customer=cus_TEST([0-9]+)/.exec(path)?.[1];
      const i = Number(id);
      return {
        data: [{ id: "sub_TEST" + i, customer: "cus_TEST" + i, status: statuses[i] }],
        has_more: false,
      };
    }
    throw new Error("Unexpected Stripe request: " + path);
  });
  return mod.checkCheckoutRisk("member@example.com", "");
}

test("a live subscription blocks duplicate checkout, even without a linked database membership", async () => {
  const result = await simulateCheckoutRisk(["active"]);
  assert.equal(result.kind, "active");
  assert.equal(result.subscriptionId, "sub_TEST0");
});

test("a lapsed payment returns recovery instead of creating another subscription", async () => {
  const result = await simulateCheckoutRisk(["past_due"]);
  assert.equal(result.kind, "recoverable");
});

test("a canceled subscriber reuses their unique old customer after termination", async () => {
  const result = await simulateCheckoutRisk(["canceled"]);
  assert.equal(result.kind, "clear");
  assert.equal(result.customerId, "cus_TEST0");
});

test("any still-active subscriber blocks charging again across multiple customer records", async () => {
  const result = await simulateCheckoutRisk(["canceled", "active"]);
  assert.equal(result.kind, "active");
  assert.equal(result.customerId, "cus_TEST1");
});

test("incomplete customer search fails closed rather than risking another charge", async () => {
  await assert.rejects(simulateCheckoutRisk(["canceled"], { moreCustomers: true }), /safe verification limit/);
});

async function legacyDiscovery({ pickaxeEmail, customerEmail, status, duplicate = false }) {
  const stripeState = await stripeLifecycle(async () => ({}));
  const products = JSON.stringify(["access-b232b0a3-4713-45b4-a7ab-3daba2faa4d9"]);
  const subscriptions = [{
    id: "sub_OLD1", customer: "cus_OLD1", status,
    created: 1790000000,
    metadata: {
      studioId: "STUDIOFEB9DXAKH9BA0QAXYBA6",
      studioUserId: "USERVERIFIED123",
      productIds: products,
    },
  }];
  if (duplicate) subscriptions.push({
    ...subscriptions[0], id: "sub_OLD2", created: 1790000001,
  });
  const mod = await loadModule("lib/legacyBillingVerification.ts", {
    "@/lib/pickaxeAccess": {
      getPickaxeUser: async () => ({ id: "USERVERIFIED123", email: pickaxeEmail }),
      FITNESS_ACCESS_GROUP_ID: "access-b232b0a3-4713-45b4-a7ab-3daba2faa4d9",
    },
    "@/lib/stripeServer": {
      stripeRequest: async (path) => {
        if (path.startsWith("/subscriptions?")) return { data: subscriptions, has_more: false };
        if (path.startsWith("/customers/")) return { id: "cus_OLD1", email: customerEmail };
        throw new Error("Unexpected Stripe request: " + path);
      },
    },
    "@/lib/stripeMembershipState": stripeState,
  });
  return mod.discoverVerifiedHistoricalBilling("member@example.com");
}

test("a verified historical canceled Pickaxe subscriber is recognized as inactive", async () => {
  const result = await legacyDiscovery({
    pickaxeEmail: "member@example.com",
    customerEmail: "member@example.com",
    status: "canceled",
  });
  assert.equal(result.subscriptionId, "sub_OLD1");
  assert.equal(result.active, false);
  assert.equal(result.status, "canceled");
});

test("historical billing cannot link when Pickaxe or Stripe customer emails differ", async () => {
  const mismatchedPickaxe = await legacyDiscovery({
    pickaxeEmail: "somebody-else@example.com",
    customerEmail: "member@example.com",
    status: "active",
  });
  assert.equal(mismatchedPickaxe, null);
  const mismatchedStripe = await legacyDiscovery({
    pickaxeEmail: "member@example.com",
    customerEmail: "somebody-else@example.com",
    status: "active",
  });
  assert.equal(mismatchedStripe, null);
});

test("ambiguous historical active subscriptions require review rather than auto-linking", async () => {
  await assert.rejects(legacyDiscovery({
    pickaxeEmail: "member@example.com",
    customerEmail: "member@example.com",
    status: "active",
    duplicate: true,
  }), /Multiple historical paid subscriptions/);
});

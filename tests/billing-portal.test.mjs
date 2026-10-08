import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

// Members had no online way to cancel (found in the paid test pass, 2026-10-07): the only route was an email
// address inside the Terms. /api/billing/portal opens Stripe's customer portal; anything that stops it sends
// the member back to /fitness/membership, which always shows the email fallback.
const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const routeSource = await source("app/api/billing/portal/route.ts");
const compiled = ts.transpileModule(routeSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const MEMBER = { id: "user_1", primaryEmailAddressId: "e1", emailAddresses: [{ id: "e1", emailAddress: "Member@Example.com" }] };
const ORIGIN = "https://www.aicoachdir.com";

function load({ user = MEMBER, membership = { stripe_customer_id: "cus_123" }, configured = true, stripe } = {}) {
  const calls = { stripe: [], membershipEmail: null };
  const module_ = { exports: {} };
  vm.runInNewContext(compiled, {
    module: module_, exports: module_.exports, console: { error() {}, info() {}, warn() {} },
    Response, URL, URLSearchParams,
    require: (name) => {
      if (name === "@clerk/nextjs/server") return { currentUser: async () => user };
      if (name === "@/lib/fitnessMembershipDb") return {
        getFitnessMembership: async (email) => { calls.membershipEmail = email; return membership; },
      };
      if (name === "@/lib/stripeServer") return {
        stripeConfigured: () => configured,
        stripeRequest: async (path, init) => {
          calls.stripe.push({ path, method: init?.method, body: Object.fromEntries(init?.body ?? []) });
          return stripe ? stripe() : { url: "https://billing.stripe.com/p/session/test_abc" };
        },
      };
      throw new Error("Unexpected import: " + name);
    },
  }, { timeout: 5000 });
  return { POST: module_.exports.POST, calls };
}

const post = (POST) => POST(new Request(`${ORIGIN}/api/billing/portal`, { method: "POST" }));
const UNAVAILABLE = `${ORIGIN}/fitness/membership?portal=unavailable`;

test("a paying member is sent to Stripe's portal for their own customer, returning to the membership page", async () => {
  const { POST, calls } = load();
  const res = await post(POST);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), "https://billing.stripe.com/p/session/test_abc");
  assert.equal(calls.membershipEmail, "member@example.com");
  assert.deepEqual(JSON.parse(JSON.stringify(calls.stripe)), [{ path: "/billing_portal/sessions", method: "POST",
    body: { customer: "cus_123", return_url: `${ORIGIN}/fitness/membership` } }]);
});

test("signed out: sent to member login, and nothing is looked up", async () => {
  const { POST, calls } = load({ user: null });
  const res = await post(POST);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), `${ORIGIN}/fitness/login`);
  assert.equal(calls.membershipEmail, null);
  assert.equal(calls.stripe.length, 0);
});

test("a member with no Stripe customer (a legacy Pickaxe member) gets the email fallback, and Stripe is not called", async () => {
  for (const membership of [null, { stripe_customer_id: null }, { stripe_customer_id: "" }]) {
    const { POST, calls } = load({ membership });
    const res = await post(POST);
    assert.equal(res.headers.get("location"), UNAVAILABLE);
    assert.equal(calls.stripe.length, 0);
  }
});

test("Stripe not configured, a Stripe error, or a session without an https URL: the email fallback", async () => {
  for (const options of [
    { configured: false },
    { stripe: () => { throw new Error("No configuration provided"); } },
    { stripe: () => ({ url: null }) },
    { stripe: () => ({ url: "http://billing.example.com/" }) },
  ]) {
    const { POST } = load(options);
    const res = await post(POST);
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), UNAVAILABLE);
  }
});

test("members can find it: the member area links to Manage membership, and the page shows the email fallback", async () => {
  const chat = await source("app/fitness/chat/page.tsx");
  assert.match(chat, /<Link href="\/fitness\/membership" className="secondary-button">Manage membership<\/Link>/);
  const page = await source("app/fitness/membership/page.tsx");
  assert.match(page, /<form method="post" action="\/api\/billing\/portal"/);
  assert.match(page, /const SUPPORT_EMAIL = "Ai\.coach\.hub\.domain@gmail\.com";/);
  assert.match(page, /href=\{`mailto:\$\{SUPPORT_EMAIL\}`\}/);
});

test("checkout says how to cancel beside the renewal notice", async () => {
  const card = await source("components/FitnessCheckoutCard.tsx");
  assert.match(card, /renews automatically until canceled[\s\S]{0,200}Cancel anytime from\s+Manage membership/);
});

test("access still ends through the existing webhook when a portal cancellation reaches the period end", async () => {
  const webhook = await source("app/api/billing/webhook/route.ts");
  assert.match(webhook, /customer\.subscription\.deleted/);
  assert.match(webhook, /eventType !== "customer\.subscription\.deleted" &&/);
});

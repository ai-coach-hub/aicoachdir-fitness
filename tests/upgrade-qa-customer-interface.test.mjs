import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
const load=p=>readFileSync(p,"utf8");
const qa="feature/verified-subscription-upgrade-policy-20261027";
test("upgrade-branch Life access binds verified Clerk and Stripe, not an email alone",()=>{
 const access=load("lib/lifeCoachAccess.ts");
 assert.ok(access.includes(qa));
 assert.ok(access.includes("primary.verification?.status !== \"verified\""));
 assert.ok(access.includes("verifiedSandboxStripeAccount"));
 assert.ok(access.includes("member.clerk_user_id!==user.id"));
 assert.ok(access.includes("getVerifiedSubscription"));
});
test("new Life conversations cannot reuse production or private Life storage",()=>{
 const store=load("lib/lifeCoachStore.ts");
 assert.ok(store.includes("UPGRADE_SANDBOX_DATABASE_URL"));
 assert.ok(store.includes("br-young-salad-aubnf7xt"));
 assert.ok(store.includes("Life Coach upgrade QA database branch mismatch"));
 assert.ok(store.includes("PRODUCTION_NEON_BRANCH_ID"));
});
test("upgrade preview Life generation requires metering and provider credentials",()=>{
 const api=load("app/api/life/chat/route.ts");
 assert.ok(api.includes('UPGRADE_SANDBOX_SHARED_METER_ENABLED!=="true"'));
 assert.ok(api.includes("reserveSharedUsage(email,\"life\",requestKey)"));
 assert.ok(api.includes("settleSharedUsage(email,\"life\",requestKey,outcome)"));
 assert.ok(api.includes("PICKAXE_LIFE_COACH_DEPLOYMENT_TOKEN"));
});
test("upgrade UI has explicit preview and confirmation steps, no automatic billing POST",()=>{
 const ui=load("components/SandboxUpgradeClient.tsx");
 assert.ok(ui.includes('action:"quote"'));
 assert.ok(ui.includes('action:"confirm"'));
 assert.ok(ui.includes("expectedAmountCents:amount"));
 assert.ok(ui.includes("Confirm test-only upgrade"));
 assert.ok(ui.includes("No charge to a real payment method"));
 assert.match(ui,/useEffect\(\(\)=>\{void reload\(\)/);
});
test("authenticated test-only wallet attachment preserves used and reserved messages",()=>{
 const route=load("app/api/billing/sandbox-upgrade/current/route.ts");
 const source=load("lib/sandboxUpgradeReadiness.ts");
 assert.ok(route.includes('VERCEL_ENV!=="preview"'));
 assert.ok(route.includes('request.headers.get("origin")'));
 assert.ok(source.includes("stripeMode()!==\"test\""));
 assert.ok(source.includes("verifiedSandboxStripeAccount"));
 assert.ok(source.includes("QA_NEON"));
 assert.ok(source.includes("i.state='applied'"));
 assert.ok(source.includes("limit_uses,completed_uses,reserved_uses"));
 assert.ok(source.includes("ON CONFLICT DO NOTHING"));
 assert.ok(!source.includes("process.env.DATABASE_URL"));
 assert.ok(!source.includes("UPDATE public.shared_ai_usage_periods"));
});

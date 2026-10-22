import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Life Coach has no production-access path before owner approval", () => {
  const access = read("lib/lifeCoachAccess.ts");
  const route = read("app/api/life/chat/route.ts");
  const page = read("app/life/page.tsx");
  assert.ok(access.includes('process.env.VERCEL_ENV==="preview"'));
  assert.ok(access.includes('process.env.VERCEL_ENV==="production"'));
  for(const flag of ['SHARED_USAGE_GATE_ENABLED','SHARED_USAGE_PUBLIC_RELEASE_APPROVED','LIFE_COACH_LIVE_ENABLED'])assert.ok(access.includes(flag));
  assert.ok(access.includes('primary.verification?.status !== "verified"'));
  assert.ok(access.includes('return allowed.includes(email)?user.id:null'));
  assert.ok(page.includes("lifeTester()"));
  for (const fn of ["GET", "POST"]) {
    const start = route.indexOf("export async function " + fn + "(");
    assert.ok(start >= 0);
    const body = route.slice(start, fn === "GET" ? route.indexOf("export async function POST") : undefined);
    const auth = body.indexOf("const member=await lifeTester()");
    const denied = body.indexOf('if(!member)return json({ok:false,error:"Private Life Coach access is required."},403)');
    assert.ok(auth >= 0 && denied > auth && denied - auth < 160);
  }
});

test("private Life Coach never silently inherits current $15 Fitness/Budgeting billing", () => {
  const page = read("app/page.tsx");
  const route = read("app/api/life/chat/route.ts");
  const access = read("lib/lifeCoachAccess.ts");
  assert.ok(page.includes('price: "$15"'));
  assert.ok(page.includes('uses: "400"'));
  assert.ok(page.includes("const upcomingCoaches"));
  assert.ok(page.includes('name: "AI Coaching for Life"'));
  assert.ok(!page.includes('href="/life"'));
  assert.ok(!page.includes("href={'/life'}"));
  assert.ok(!route.includes("ensureStripeBillingResources"));
  assert.ok(access.includes("memberHasFitnessAccess"));
  assert.ok(access.includes('SHARED_USAGE_PUBLIC_RELEASE_APPROVED'));
});

test("private Life Coach data remains on its dedicated Neon connection", () => {
  const store = read("lib/lifeCoachStore.ts");
  assert.ok(store.includes("process.env.LIFE_COACH_DATABASE_URL"));
  assert.ok(store.includes('process.env.DATABASE_URL'));
  assert.ok(store.includes('process.env.POSTGRES_URL'));
  assert.ok(store.includes('if(productionReleased)return sql'));
  assert.ok(store.includes('PRIVATE_NEON_BRANCH_ID'));
  assert.ok(store.includes("PRIMARY KEY (member_id,id)"));
  assert.ok(store.includes("FOREIGN KEY (member_id,conversation_id)"));
});

test("release checklist requires real second-account check and explicit pricing approval", () => {
  const docs = read("docs/life-coach/LAUNCH_READINESS.md");
  assert.ok(docs.includes("two-real-Clerk-account test has NOT passed"));
  assert.ok(docs.includes("BLOCKING"));
  assert.ok(docs.includes("Do not involve any existing paying customer"));
  assert.ok(docs.includes("do NOT auto-create, delete, archive") ||
    docs.includes("Do NOT auto-create, delete, archive"));
  assert.ok(docs.includes("NOT READY TO MERGE OR PUBLISH"));
});

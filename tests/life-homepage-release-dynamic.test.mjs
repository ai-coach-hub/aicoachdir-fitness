import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const page=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
test("homepage availability is dynamic and never freezes release flags in a static build",()=>{
 assert.match(page,/export const dynamic = "force-dynamic"/);
 assert.match(page,/lifeAvailable &&/);
 assert.match(page,/coming-soon-grid/);
 assert.match(page,/coach\.name !== "AI Coaching for Life"/);
});
test("Life Coach live card does not claim paying members must wait until renewal",()=>{
 assert.match(page,/Start Life Coach/);
 assert.match(page,/Get personalized guidance for daily routines, meaningful goals, and personal growth/);
 assert.doesNotMatch(page,/complimentary launch allowance|Same membership ·/);
 assert.doesNotMatch(page,/Life Coach unlocks at your next verified membership renewal/);
});

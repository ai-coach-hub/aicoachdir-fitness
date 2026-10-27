import test from "node:test";
import assert from "node:assert/strict";
import {COACH_CATALOG,catalogValid,visibleMemberCoaches,availableCoachBySlug} from "../lib/coachLaunchCatalog.mjs";
test("existing cards remain in their established order",()=>{
 assert.equal(catalogValid(),true);
 assert.deepEqual(visibleMemberCoaches().map(c=>c.slug),["fitness","budgeting"]);
 assert.deepEqual(visibleMemberCoaches({lifeAvailable:true}).map(c=>c.slug),["fitness","budgeting","life"]);
});
test("Career cannot leak into member dashboard until separately released",()=>{
 assert.equal(availableCoachBySlug("career",{lifeAvailable:true}),null);
 assert.equal(COACH_CATALOG.find(x=>x.slug==="career").href,null);
});
test("duplicated, external, or unshipped links fail closed",()=>{
 const rows=COACH_CATALOG.map(c=>({...c}));
 rows[0].href="https://malicious.invalid";
 assert.equal(catalogValid(rows),false);
 rows[0].href="/fitness/chat";
 rows[3].href="/career";
 assert.equal(catalogValid(rows),false);
 rows[3].href=null;
 rows.push({...rows[0]});
 assert.equal(catalogValid(rows),false);
});

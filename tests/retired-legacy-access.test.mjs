import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const db=readFileSync(new URL("../lib/fitnessMembershipDb.ts",import.meta.url),"utf8");
test("owner-retired legacy account cannot be regranted by historical Pickaxe fallback",()=>{
 const gate=db.indexOf('existing?.stripe_status === "retired_owner_requested"');
 const fallback=db.indexOf("const legacyActive = await pickaxeUserHasFitnessAccess",gate);
 assert.ok(gate>=0 && fallback>gate,"retirement must block legacy fallback");
 assert.match(db.slice(gate,fallback),/return false/);
});
test("retirement does not change general legacy account eligibility",()=>{
 assert.match(db,/if \(existing\?\.access_active === true\)/);
 assert.match(db,/stripe_status === "retired_owner_requested"/);
 assert.doesNotMatch(db,/email\s*===\s*["']kunruh@keystoneschool.org/);
});
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const source=read("../lib/pickaxeAccess.ts");
const preflight=read("../lib/publicIntroductoryTrialPreflight.ts");

test("public trial requires exhaustive Pickaxe member/legacy access checks",()=>{
 assert.match(preflight,/getPickaxeUser\(email,\{fallbackToList:true,requireExhaustiveList:true\}\)/);
 assert.match(preflight,/pickaxeUserHasFitnessAccess\(email,\{fallbackToList:true,requireExhaustiveList:true\}\)/);
 assert.match(source,/requireExhaustiveList\?: boolean/);
 assert.match(source,/requireExhaustiveList && !validPage/);
 assert.match(source,/requireExhaustiveList && skip === 900/);
 assert.match(source,/requireCompleteLookup\) throw new Error/);
 assert.match(source,/fitnessLegacyProductIds\(options\.requireExhaustiveList === true\)/);
});
test("legacy access checks used outside trial remain unchanged by default",()=>{
 assert.match(source,/async function findPickaxeUserInList\(email: string, requireExhaustiveList = false\)/);
 assert.match(source,/async function fitnessLegacyProductIds\(requireCompleteLookup = false\)/);
});

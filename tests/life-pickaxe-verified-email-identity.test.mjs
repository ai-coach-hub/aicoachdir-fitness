import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// The shared wallet and provider must use the same authenticated member email.
// Clerk IDs own private Neon conversations but are NOT the Pickaxe user identity.
const route=readFileSync(new URL("../app/api/life/chat/route.ts",import.meta.url),"utf8");

test("Life Coach Pickaxe completion uses verified member email, not Clerk user ID",()=>{
 assert.match(route,/async function completeLifeCoachRequest\(token:string,promptMessage:string,verifiedEmail:string,id:string\)/);
 assert.match(route,/userId:verifiedEmail/);
 assert.match(route,/completeLifeCoachRequest\(token,promptMessage,email,id\)/);
 assert.doesNotMatch(route,/userId:member[,}]/);
});

test("Life Coach retains Clerk ID for private conversation ownership",()=>{
 assert.match(route,/listLifeThreads\(member\)/);
 assert.match(route,/saveLifeTurn\(member,id,message,answer\)/);
});

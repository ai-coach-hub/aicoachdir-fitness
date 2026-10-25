import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("Fitness Home returns an authenticated member to dashboard",()=>{
 const page=read("app/fitness/chat/page.tsx");
 assert.match(page,/<Link href="\/dashboard" className="secondary-button">Dashboard<\/Link>/);
});
test("existing workout and coach views remain reachable",()=>{
 const page=read("app/fitness/chat/page.tsx");
 assert.match(page,/setTab\("coach"\)/);
 assert.match(page,/setTab\("workouts"\)/);
});

import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("My Workouts dashboard tile requests the workout view rather than Coach Chat",()=>{
 const dashboard=read("app/dashboard/page.tsx");
 assert.match(read("lib/coachLaunchCatalog.mjs"),/toolHref:"\/fitness\/chat\?view=workouts"/);
});
test("Fitness member page switches to the workout tab when explicitly requested",()=>{
 const chat=read("app/fitness/chat/page.tsx");
 assert.match(chat,/new URLSearchParams\(window\.location\.search\)\.get\("view"\) === "workouts"/);
 assert.match(chat,/setTab\("workouts"\)/);
});
test("visible Fitness heading drops obsolete versioned brand",()=>{
 const chat=read("app/fitness/chat/page.tsx");
 assert.doesNotMatch(chat,/AI FITNESS COACH 2\.0/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = p => readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('single member entry',()=>{assert.match(read('app/fitness/login/page.tsx'),/dashboard/);assert.doesNotMatch(read('app/page.tsx'),/Fitness Member Login|Budgeting Member Login/);});
test('protected image rich dashboard and tools',()=>{const p=read('app/dashboard/page.tsx');assert.match(p,/memberHasFitnessAccess/);assert.match(p,/lifeTester/);assert.match(read('lib/coachLaunchCatalog.mjs'),/My Workouts/);assert.match(read('lib/coachLaunchCatalog.mjs'),/My Budget/);assert.match(read('app/dashboard/dashboard.module.css'),/@media/);});

test('coach cards include their companion tools in the same action group',()=>{
 const page=read('app/dashboard/page.tsx');
 assert.match(page,/coaches\.map\(coach/);assert.match(read('lib/coachLaunchCatalog.mjs'),/toolHref:"\/fitness\/chat\?view=workouts"/);
 assert.match(read('lib/coachLaunchCatalog.mjs'),/toolHref:"\/budgeting\/launch\?destination=tracker"/);
 assert.match(read('app/dashboard/dashboard.module.css'), /@media\(max-width:650px\)\{\.cardActions\{flex-direction:column/);
});

test("production Life Coach returns to member dashboard; preview remains isolated",()=>{const p=read("app/life/page.tsx");assert.match(p,/process\.env\.VERCEL_ENV==="production" \? "\/dashboard" : "\/"/);assert.match(p,/"Dashboard" : "AI Coach Directory"/);});

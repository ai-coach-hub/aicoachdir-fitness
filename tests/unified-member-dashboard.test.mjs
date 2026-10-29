import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = p => readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('single member entry',()=>{assert.match(read('app/fitness/login/page.tsx'),/dashboard/);assert.doesNotMatch(read('app/page.tsx'),/Fitness Member Login|Budgeting Member Login/);});
test('protected image rich dashboard and tools',()=>{const p=read('app/dashboard/page.tsx');assert.match(p,/memberHasFitnessAccess/);assert.match(p,/lifeTester/);assert.match(p,/My Workouts/);assert.match(p,/My Budget/);assert.match(read('app/dashboard/dashboard.module.css'),/@media/);});

test('coach cards include their companion tools in the same action group',()=>{
 const page=read('app/dashboard/page.tsx');
 assert.match(page, /className=\{styles\.cardActions\}><Link href="\/fitness\/chat">Open Fitness Coach<\/Link><Link href="\/fitness\/chat\?view=workouts" className=\{styles\.toolAction\}>My Workouts/);
 assert.match(page, /className=\{styles\.cardActions\}><Link href="\/budgeting\/launch\?destination=coach">Open Budgeting Coach<\/Link><Link href="\/budgeting\/launch\?destination=tracker" className=\{styles\.toolAction\}>My Budget/);
 assert.match(read('app/dashboard/dashboard.module.css'), /@media\(max-width:650px\)\{\.cardActions\{flex-direction:column/);
});

test("production and paid QA Life Coach return to dashboard; private legacy preview remains isolated",()=>{const p=read("app/life/page.tsx");assert.match(p,/process\.env\.VERCEL_ENV==="production" \|\| process\.env\.VERCEL_GIT_COMMIT_REF==="feature\/verified-subscription-upgrade-policy-20261027" \? "\/dashboard" : "\/"/);assert.match(p,/privatePreview=\{process\.env\.VERCEL_ENV==="preview"/);});

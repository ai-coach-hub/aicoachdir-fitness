import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = p => readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('single member entry',()=>{assert.match(read('app/fitness/login/page.tsx'),/dashboard/);assert.doesNotMatch(read('app/page.tsx'),/Fitness Member Login|Budgeting Member Login/);});
test('protected image rich dashboard and tools',()=>{const p=read('app/dashboard/page.tsx');assert.match(p,/memberHasFitnessAccess/);assert.match(p,/lifeTester/);assert.match(p,/My Workouts/);assert.match(p,/My Budget/);assert.match(read('app/dashboard/dashboard.module.css'),/@media/);});

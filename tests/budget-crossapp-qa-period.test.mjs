import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const route=readFileSync(new URL('../app/api/life/shared-usage-service/route.ts',import.meta.url),'utf8');
const enrollment=readFileSync(new URL('../lib/previewLifeTestEnrollment.ts',import.meta.url),'utf8');

test('cross-app QA uses a separate fixed preview-only period',()=>{
 assert.match(enrollment,/preview-budget-crossapp-qa-20261023/);
 assert.match(enrollment,/budgetCrossAppQaPeriod/);
 assert.match(route,/subscriptionKey:budgetCrossAppQaSubscription/);
 assert.match(route,/periodStart:budgetCrossAppQaPeriod/);
});
test('only an enrolled, bound QA member can initialize the new period',()=>{
 assert.match(route,/resolvePrivatePreviewBudgetMember/);
 assert.match(route,/lifeTestStatus\(member\)/);
 assert.match(route,/await ensureBudgetCrossAppQaPeriod\(member\)/);
 assert.match(enrollment,/export async function ensureBudgetCrossAppQaPeriod/);
 assert.match(enrollment,/ON CONFLICT/);
 assert.match(enrollment,/previewLifeTestSubscription/);
});

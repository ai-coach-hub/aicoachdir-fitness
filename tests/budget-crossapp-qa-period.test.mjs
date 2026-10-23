import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../app/api/life/shared-usage-service/route.ts',import.meta.url),'utf8');
test('cross-app test has a separate metering period',()=>{assert.match(code,/preview-budget-crossapp-qa-20261023/);assert.match(code,/budgetCrossAppQaPeriod/);});

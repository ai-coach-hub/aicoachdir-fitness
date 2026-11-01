import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('tier status uses account-scoped live price verification without unnecessary Accounts Read',()=>{
 const runtime=read('lib/tierChangeRuntime.ts');
 assert.doesNotMatch(runtime,/stripe\('\/account'\)/);
 assert.match(runtime,/stripe\('\/prices\/'\+map\[t\.tier\]\)/);
 assert.match(runtime,/price\.unit_amount!==t\.cents/);
});
test('active billing and tier status provide honest states and legible actions',()=>{
 const page=read('app/manage-subscription/page.tsx');
 const route=read('app/api/billing/tier-change/current/route.ts');
 const css=read('app/globals.css');
 assert.match(page,/className="login-config-card manage-subscription-card"/);
 assert.match(page,/<TierChangeClient \/>/);
 assert.doesNotMatch(route,/Sign in with your verified member account to manage plans/);
 assert.match(css,/\.manage-subscription-card \.secondary-button/);
 assert.match(css,/color: #f4f7ff/);
});

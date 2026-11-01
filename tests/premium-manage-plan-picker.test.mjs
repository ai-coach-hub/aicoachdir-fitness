import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('premium tier selection is accessible and keeps existing billing calls',()=>{
 const s=read('components/TierChangeClient.tsx'),css=read('app/globals.css');
 assert.doesNotMatch(s,/<select id="new-plan"/);
 assert.match(s,/aria-pressed=\{selected\}/);
 assert.match(s,/onClick=\{\(\)=>setTarget\(p\.tier\)\}/);
 assert.match(s,/plans\.filter\(p=>p\.tier!==current\)/);
 assert.match(s,/prepare'?,\{targetTier:target\}/);
 assert.match(s,/action:'quote'/);
 assert.match(s,/action:'confirm'/);
 assert.match(s,/action:'discard'/);
 assert.match(css,/\.tier-change-plan\.is-selected/);
 assert.match(css,/@media\(max-width:600px\)/);
});

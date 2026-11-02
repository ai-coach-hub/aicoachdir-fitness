import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("Homepage four plan cards form a symmetric responsive grid without changing plan values or signup links",()=>{
 const home=source("app/page.tsx"),styles=source("app/home.module.css");
 assert.match(home,/className=\{styles\.homePricingGrid\}/);
 assert.match(styles,/grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
 assert.match(styles,/grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
 assert.match(styles,/grid-template-columns: 1fr/);
 assert.match(styles,/\.homePricingGrid p:last-child/);
 for (const plan of ['name:"Starter",price:9,messages:100','name:"Growth",price:15,messages:200','name:"Premium",price:25,messages:400','name:"Elite",price:35,messages:600']) assert.ok(home.includes(plan));
 assert.equal((home.match(/>Get Started<\/Link>/g)||[]).length,1);
 assert.doesNotMatch(home,/More AI coaching experiences are on the way/);
 assert.match(home,/coming-soon-grid/);
});

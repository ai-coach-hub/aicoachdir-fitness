import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("membership calls to action omit review terms wording",()=>{
 const page=read("app/page.tsx");
 assert.doesNotMatch(page,/New Member — Review Terms/);
 assert.match(page,/New Member — Get Started/);
});
test("workout completed count and history link use distinct layout wrappers",()=>{
 const page=read("app/fitness/chat/page.tsx");
 assert.match(page,/className="workout-history-summary"/);
 const css=read("app/globals.css");
 assert.match(css,/\.workout-history-summary\s*\{/);
 assert.match(css,/\.workout-history-summary\s+a/);
});
test("coach card artwork remains entirely visible without cropping title",()=>{
 const css=read("app/dashboard/dashboard.module.css");
 assert.match(css,/\.card img\s*\{[^}]*object-fit:contain/);
 assert.doesNotMatch(css,/\.card img\s*\{[^}]*object-fit:cover/);
});

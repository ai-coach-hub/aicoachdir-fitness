import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../lib/isolatedIntroductoryIdentity.ts",import.meta.url),"utf8");
test("trial eligibility checks valid Clerk email with correctly escaped regex",()=>{
 const line=source.split("\n").find(x=>x.includes(".test(email)"));
 assert.ok(line);
 assert.match(line, /email\)\)return null/);
 assert.ok(line.includes(String.raw`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`));
 assert.ok(!line.includes(String.raw`/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/`));
});

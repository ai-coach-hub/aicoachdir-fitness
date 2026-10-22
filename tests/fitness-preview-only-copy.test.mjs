import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const page=readFileSync(new URL("../app/fitness/chat/page.tsx",import.meta.url),"utf8");
test("private history warning appears only after the gated private QA allowance endpoint confirms Preview",()=>{
 assert.match(page, /\{previewAllowance\s*!==\s*null\s*&&\s*<p className="microcopy">Private preview:/);
 assert.doesNotMatch(page, /\n\s*<p className="microcopy">Private preview:/);
});

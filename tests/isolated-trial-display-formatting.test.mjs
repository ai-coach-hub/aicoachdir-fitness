import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const page=readFileSync(new URL("../app/introductory-preview/page.tsx",import.meta.url),"utf8");
test("trial renders all coach answers in plain text without changing member questions",()=>{
 assert.match(page,/import \{cleanLifeCoachText\} from "@\/lib\/lifeCoachFormatting";/);
 assert.match(page,/m\.role==="assistant"\?cleanLifeCoachText\(m\.text\):m\.text/);
});

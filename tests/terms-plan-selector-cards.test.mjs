import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("Terms plans use keyboard accessible radio cards rather than native dropdown",()=>{
 const source=read("components/TermsGate.tsx");
 const css=read("app/globals.css");
 assert.match(source,/<fieldset className="terms-tier-chooser"/);
 assert.match(source,/<legend>Choose your monthly membership<\/legend>/);
 assert.match(source,/type="radio" name="membership-tier"/);
 assert.doesNotMatch(source,/<select id="terms-tier"/);
 assert.match(source,/setAgreed\(false\)/);
 assert.match(source,/tierTermsSelection\(tier\)/);
 assert.match(css,/\.terms-tier-option\.is-selected/);
 assert.match(css,/@media \(max-width: 800px\)/);
});

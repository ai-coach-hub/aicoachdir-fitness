import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";

const jsx=(type,props)=>({type,props:props||{}});
const reactRuntime={jsx,jsxs:jsx};
function component(path,env){
 const raw=readFileSync(new URL("../"+path,import.meta.url),"utf8");
 const code=ts.transpileModule(raw,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
  jsx:ts.JsxEmit.ReactJSX
 }}).outputText;
 const m={exports:{}};
 const imports={
  "react/jsx-runtime":reactRuntime,
  "next/image":{default:function Image(){}},
  "next/link":{default:function Link(){}},
  "@/components/SiteHeader":{default:function Header(){}},
  "./home.module.css":{default:{}},
  "@clerk/nextjs/server":{currentUser:async()=>null},
  "@/lib/lifeCoachAccess":{lifeTester:async()=>null},
  "./LifeChat":{default:function LifeChat(){}}
 };
 runInNewContext(code,{module:m,exports:m.exports,process:{env},require:name=>{
  assert.ok(Object.hasOwn(imports,name),"Unexpected import "+name);
  return imports[name];
 }},{timeout:3000});
 return m.exports.default;
}
function flatten(node,result={texts:[],links:[],cards:[]}){
 if(node==null||typeof node==="boolean")return result;
 if(Array.isArray(node)){for(const part of node)flatten(part,result);return result;}
 if(typeof node==="string"||typeof node==="number"){result.texts.push(String(node));return result;}
 if(typeof node!=="object")return result;
 const props=node.props||{};
 if(typeof props.href==="string")result.links.push(props.href);
 if(typeof props.className==="string"&& /(?:live-coach-card|coming-soon-card)/.test(props.className)){
  const sub=flatten(props.children);
  result.cards.push({kind:props.className,text:sub.texts.join(" "),links:sub.links});
 }
 flatten(props.children,result);
 return result;
}
const on={VERCEL_ENV:"production",SHARED_USAGE_GATE_ENABLED:"true",
 SHARED_USAGE_PUBLIC_RELEASE_APPROVED:"true",
 SHARED_USAGE_OPENING_BALANCES_RECONCILED:"true",SHARED_USAGE_CUTOVER_AT:"2026-01-01T00:00:00.000Z",LIFE_COACH_LIVE_ENABLED:"true"};

test("Home shows Life Coach as included and available only with every production release approval",()=>{
 const live=flatten(component("app/page.tsx",on)());
 assert.ok(live.cards.some(x=>x.kind==="live-coach-card"&&x.text.includes("AI COACHING FOR LIFE")&&x.links.includes("/life")));
 assert.ok(!live.cards.some(x=>x.kind==="coming-soon-card"&&x.text.includes("AI Coaching for Life")));
 assert.ok(live.texts.join(" ").includes("Life"));
 const before=flatten(component("app/page.tsx",{...on,SHARED_USAGE_OPENING_BALANCES_RECONCILED:"false"})());
 assert.ok(!before.links.includes("/life"));
 assert.ok(before.cards.some(x=>x.kind==="coming-soon-card"&&x.text.includes("AI Coaching for Life")));
 const preview=flatten(component("app/page.tsx",{...on,VERCEL_ENV:"preview"})());
 assert.ok(!preview.links.includes("/life"));
});
test("production Life Coach access-denied copy is for members, not a private preview with a free test offer",async()=>{
 const production=flatten(await component("app/life/page.tsx",on)());
 const text=production.texts.join(" ");
 assert.match(text,/AI Coaching for Life/i);
 assert.doesNotMatch(text,/Private Life Coach Preview|does not require an active Fitness subscription|approved test account/i);
 const preview=flatten(await component("app/life/page.tsx",{VERCEL_ENV:"preview"})());
 assert.match(preview.texts.join(" "),/Private Life Coach Preview/);
});

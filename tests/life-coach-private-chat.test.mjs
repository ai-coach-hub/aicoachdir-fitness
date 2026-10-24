import ts from "typescript";
import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import {readFileSync} from "node:fs";
const load=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("life chat is private by default and requires verified Clerk email",()=>{
 const access=load("lib/lifeCoachAccess.ts"),api=load("app/api/life/chat/route.ts");
 assert.match(access,/currentUser\(/);
 assert.match(access,/LIFE_COACH_TESTER_EMAILS/);
 assert.ok(access.includes('primary.verification?.status !== "verified"'));
 assert.ok(access.includes('VERCEL_ENV==="preview"'));
 for(const flag of ['SHARED_USAGE_GATE_ENABLED','SHARED_USAGE_PUBLIC_RELEASE_APPROVED','LIFE_COACH_LIVE_ENABLED'])assert.ok(access.includes(flag));
 assert.ok(access.includes("allowed.includes(email)"));
 assert.match(api,/if\(!member\)return json/);
 assert.match(api,/PICKAXE_LIFE_COACH_DEPLOYMENT_TOKEN/);
});
test("all conversation SQL scopes membership to the Clerk user",()=>{
 const store=load("lib/lifeCoachStore.ts");
 assert.match(store,/member_id TEXT NOT NULL/);
 assert.match(store,/PRIMARY KEY \(member_id,id\)/);
 for(const method of ["listLifeThreads","readLifeThread","recallLifeContext","saveLifeTurn"])assert.match(store,new RegExp("function "+method));
 assert.ok((store.match(/member_id=\$\{member\}/g)||[]).length>=4);
 assert.match(store,/conversation_id<>\$\{currentId\}/);
 assert.match(store,/LIMIT 80/);
 assert.match(store,/LIMIT 40/);
});
test("Life Coach does not create checkout or mutate unrelated coaching data",()=>{
 const api=load("app/api/life/chat/route.ts");
 assert.doesNotMatch(api,/create.checkout|checkout.sessions|budget_chat_threads|UPDATE fitness_memberships/i);
 assert.match(api,/reserveSharedUsage\(email,"life",requestKey\)/);
});

test("life coach database is isolated from shared membership storage",()=>{
 const store=load("lib/lifeCoachStore.ts");
 assert.ok(store.includes("process.env.LIFE_COACH_DATABASE_URL"));
 for(const permittedOnlyAfterApproval of ["process.env.DATABASE_URL","process.env.POSTGRES_URL","process.env.STORAGE_URL"])assert.ok(store.includes(permittedOnlyAfterApproval));
 assert.ok(store.includes('PRODUCTION_NEON_BRANCH_ID'));
 assert.match(store,/if\(productionReleased\)\{[\s\S]*?current_setting\('neon\.branch_id', true\)[\s\S]*?return sql;/);
 assert.ok(store.includes('PRIVATE_NEON_BRANCH_ID'));
});

test("private Life Coach page never sends testers into paid Fitness login",()=>{
 const page=load("app/life/page.tsx");
 assert.ok(!page.includes('redirect("/fitness/login")'));
 assert.ok(page.includes("/sign-in?redirect_url="));
 assert.ok(page.includes("lifeTester()"));
});


function lifeLogic(){
 const js=ts.transpileModule(load("lib/lifeCoachMemory.ts"),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
 }).outputText;
 const sandbox={exports:{}};
 runInNewContext(js,sandbox);
 return sandbox.exports;
}
const goal={text:"My goal this month is to improve my time management.",date:"2026-10-12"};
const failedQuiz={text:"What goal did I tell you about earlier?",date:"2026-10-12"};

test("exact previous-goal question gets grounded answer without doubled punctuation",()=>{
 const {lifeMemoryReply}=lifeLogic();
 assert.equal(lifeMemoryReply("What goal did I tell you about earlier?",[failedQuiz,goal]),
  'You previously told me: “My goal this month is to improve my time management.”');
});
test("natural progress question uses saved goal and practical action, no model",()=>{
 const {lifeMemoryReply}=lifeLogic();
 const answer=lifeMemoryReply("Can you help me make progress on the goal we discussed?",[failedQuiz,goal]);
 assert.ok(answer.includes("improve my time management"));
 assert.ok(answer.includes("15 uninterrupted minutes"));
});
test("vague previous-chat question ignores repeated memory quizzes",()=>{
 const {lifeMemoryReply,selectLifeMemories}=lifeLogic();
 const entries=[...Array.from({length:18},()=>failedQuiz),goal];
 assert.ok(lifeMemoryReply("What did we discuss in our last conversation?",entries).includes("time management"));
 assert.equal(selectLifeMemories("what goal did i mention earlier?",entries)[0].text,goal.text);
});
test("fresh coaching and detailed plan requests stay with the coach",()=>{
 const {lifeMemoryReply}=lifeLogic();
 assert.equal(lifeMemoryReply("I need a plan for tomorrow",[goal]),null);
 assert.equal(lifeMemoryReply("Create a detailed weekly schedule for the goal we discussed",[goal]),null);
 assert.equal(lifeMemoryReply("Help me build a 7-day plan for the goal we discussed",[goal]),null);
});
test("safety-sensitive prior goals do not generate canned coaching",()=>{
 const {lifeMemoryReply}=lifeLogic();
 const sensitive=[{text:"My goal is to starve myself.",date:"2026-10-12"}];
 assert.equal(lifeMemoryReply("Can you help me make progress on the goal we discussed?",sensitive),null);
});
test("a false memory-access disclaimer is replaced with grounded history, no second call",()=>{
 const {guardLifeMemoryDenial}=lifeLogic();
 const answer=guardLifeMemoryDenial("I don't have access to previous conversations.",
   "Can you help me plan around the goal we discussed?",[goal]);
 assert.ok(answer.includes("improve my time management"));
 assert.ok(!answer.includes("don't have access"));
});
test("Life Coach tenant SQL stays member-scoped and memory sources are bounded",()=>{
 const store=load("lib/lifeCoachStore.ts");
 const route=load("app/api/life/chat/route.ts");
 const userQueries=store.match(/WHERE member_id=\$\{member\} AND conversation_id<>\$\{currentId\} AND role='user'/g)||[];
 assert.equal(userQueries.length,2);
 assert.ok(store.includes("selectLifeMemories(query,entries)"));
 assert.ok(store.includes("ORDER BY id DESC LIMIT 40"));
 assert.ok(store.includes("ORDER BY id DESC LIMIT 80"));
 assert.ok(route.includes("lifeTester()"));
});
test("memory replies happen before any Pickaxe request, with source tag",()=>{
 const route=load("app/api/life/chat/route.ts");
 const direct=route.indexOf("const direct=lifeMemoryReply(message,memories)");
 const reply=route.indexOf('source:"saved-private-history"',direct);
 const token=route.indexOf("process.env.PICKAXE_LIFE_COACH_DEPLOYMENT_TOKEN");
 const provider=route.indexOf('await fetch("https://api.pickaxe.co');
 const generationCall=route.indexOf("completeLifeCoachRequest(token,promptMessage,email,id)",reply);
 assert.ok(provider>0 && direct>0 && reply>direct && token>reply && generationCall>token);
 assert.ok(route.includes("guardLifeMemoryDenial(rawAnswer,message,memories)"));
 assert.ok(route.includes("const promptMessage=prior||recalled ?"));
});
test("history proof is private, read-only and never calls Pickaxe",()=>{
 const route=load("app/api/life/chat/route.ts");
 const get=route.slice(route.indexOf("export async function GET"),route.indexOf("export async function POST"));
 assert.ok(get.includes('params.get("recall")==="goal"'));
 assert.ok(get.includes('source:"saved-private-history"'));
 assert.ok(!get.includes("api.pickaxe.co"));
 assert.ok(!get.includes("saveLifeTurn"));
});
test("Life Coach chat labels display without escaped newlines",()=>{
 const ui=load("app/life/LifeChat.tsx");
 assert.ok(ui.includes("marginTop:4"));
 assert.ok(!ui.includes('}</strong>\\n{m.text}'));
});

test("natural what-is-my-goal question also uses verified memory without model",()=>{
 const {lifeMemoryReply}=lifeLogic();
 assert.ok(lifeMemoryReply("What's my goal?",[goal]).includes("time management"));
});
test("false memory denial is not changed for unrelated questions",()=>{
 const {guardLifeMemoryDenial}=lifeLogic();
 const provider="I don't have access to previous conversations.";
 assert.equal(guardLifeMemoryDenial(provider,"How can I protect my privacy?",[goal]),provider);
});

test("Life Coach chat fits narrow screens and supports low-friction typing",()=>{
 const css=load("app/life/LifeChat.module.css");
 const ui=load("app/life/LifeChat.tsx");
 assert.ok(css.includes("@media (max-width: 760px)"));
 assert.ok(css.includes("grid-template-columns: minmax(0, 1fr)"));
 assert.ok(css.includes("overflow-x: auto"));
 assert.ok(ui.includes("!messages.length&&!input.trim()"));
 assert.ok(ui.includes("disabled={busy}"));
 assert.ok(ui.includes("styles.chatPanel"));
 assert.ok(ui.includes("styles.threadList"));
});


function formattingLogic() {
 const js=ts.transpileModule(load("lib/lifeCoachFormatting.ts"),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
 }).outputText;
 const sandbox={exports:{}};
 runInNewContext(js,sandbox);
 return sandbox.exports;
}
test("Life Coach seven-day plans display without Markdown symbols and fake fields",()=>{
 const {cleanLifeCoachText,isLifeCoachSectionHeading}=formattingLogic();
 const original=[
  "# Your 7-Day Time-Management Action Plan",
  "**Goal:** Improve my time management",
  "**Week starting:** [Date]",
  "**Overall approach:** One action each day.",
  "---",
  "## Day 1: List Your Time Wasters",
  "**Action:** Spend 10 minutes noting distractions.",
  "- **What:** Identify 3–5 activities that consume time.",
  "- **When:** After lunch.",
  "**Tracking:** ☐ Completed",
  "**Notes:**",
  "---",
  "## Day 2: Protect One Time Block",
  "- **What:** Silence your phone for 30 minutes.",
  "**Tracking:** ☐ Completed"
 ].join("\n");
 const cleaned=cleanLifeCoachText(original);
 assert.ok(cleaned.includes("Your 7-Day Time-Management Action Plan"));
 assert.ok(cleaned.includes("Goal: Improve my time management"));
 assert.ok(cleaned.includes("Day 1: List Your Time Wasters"));
 assert.ok(cleaned.includes("Action: Spend 10 minutes noting distractions."));
 assert.ok(cleaned.includes("What: Identify 3–5 activities"));
 assert.ok(cleaned.includes("When: After lunch"));
 assert.ok(cleaned.includes("Day 2: Protect One Time Block"));
 for(const marker of ["**","##","---","[Date]","Tracking:","Notes:","☐"]){
  assert.ok(!cleaned.includes(marker),"unexpected symbol/template: "+marker);
 }
 assert.ok(isLifeCoachSectionHeading("Day 2: Protect One Time Block"));
 assert.ok(!isLifeCoachSectionHeading("When: After lunch"));
});
test("escaped Markdown is normalized and clean replies remain unchanged",()=>{
 const {cleanLifeCoachText}=formattingLogic();
 const raw="\\*\\*Goal:\\*\\* Make daily progress.\n\\#\\# Day 1: Start small\n\\*\\*Action:\\*\\* Try for \\~2 minutes.";
 const cleaned=cleanLifeCoachText(raw);
 assert.ok(cleaned.includes("Goal: Make daily progress."));
 assert.ok(cleaned.includes("Day 1: Start small"));
 assert.ok(cleaned.includes("Action: Try for ~2 minutes."));
 assert.ok(!cleaned.includes("**"));
 assert.equal(cleanLifeCoachText(cleaned),cleaned);
 assert.equal(cleanLifeCoachText("My #1 goal is learning 2+2."),"My #1 goal is learning 2+2.");
});
test("API cleans new model replies and UI cleans old replies, without altering user messages",()=>{
 const api=load("app/api/life/chat/route.ts");
 const ui=load("app/life/LifeChat.tsx");
 assert.ok(api.includes("cleanLifeCoachText(guardLifeMemoryDenial(rawAnswer,message,memories))"));
 assert.ok(ui.includes("cleanLifeCoachText(text)"));
 assert.ok(ui.includes('m.role==="assistant"?<CoachResponse text={m.text}/>:m.text'));
 assert.ok(api.includes("await saveLifeTurn(member,id,message,answer)"));
 assert.ok(api.includes('value:{ok:true,response:answer,conversationId:id'));
 assert.ok(api.includes("Private usage test enrollment is required."));
});

test("missing site-local goals defer to the metered coach instead of falsely denying Pickaxe memories",()=>{
 const {lifeMemoryReply}=lifeLogic();
 assert.equal(lifeMemoryReply("What goals have I told you about before?",[]),null);
 assert.equal(lifeMemoryReply("What goal did I tell you about earlier?",[]),null);
 assert.equal(lifeMemoryReply("What goals have I told you about before?",[failedQuiz]),null);
 assert.equal(lifeMemoryReply("What goals have I told you about before?",[goal]),
  'You previously told me: “My goal this month is to improve my time management.”');
 const route=load("app/api/life/chat/route.ts");
 assert.ok(route.indexOf("const direct=lifeMemoryReply(message,memories)")<route.indexOf("reserveSharedUsage(email,\"life\",requestKey)"));
});

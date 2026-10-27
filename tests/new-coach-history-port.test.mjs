import test from "node:test";
import assert from "node:assert/strict";
import {coachHistoryKey,newCoachHistoryPort} from "../lib/newCoachHistoryPort.mjs";
const member="user_123456789012",id="career-123456789012",key="req_1234567890123456";
test("history is scoped to a stable member and coach",async()=>{
 const calls=[];const repo={read:async x=>{calls.push(x);return []},save:async x=>{calls.push(x);return "saved"}};
 const port=newCoachHistoryPort({coach:"career",memberId:member,repo});
 assert.deepEqual(await port.read(id),[]);
 assert.equal(await port.save(id,key,"question","reply"),"saved");
 assert.equal(calls.length,2);
 assert.equal(calls[1].memberId,member);
 assert.equal(calls[1].coach,"career");
 assert.equal(await port.read("life-123456789012"),null);
 assert.equal(await port.save("life-123456789012",key,"question","reply"),"invalid");
 assert.equal(calls.length,2);
});
test("invalid identities or request keys cannot touch repository",async()=>{
 let touched=0;const repo={read:async()=>{touched++},save:async()=>{touched++}};
 assert.equal(coachHistoryKey("career","user_invalid","career-123456789012"),null);
 assert.equal(newCoachHistoryPort({coach:"career",memberId:"missing",repo}),null);
 const port=newCoachHistoryPort({coach:"career",memberId:member,repo});
 assert.equal(await port.save(id,"bad","q","a"),"invalid");
 assert.equal(touched,0);
});

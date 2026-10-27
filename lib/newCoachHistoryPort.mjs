/**
 * Reusable coach-scoped conversation storage contract. No database mutations
 * happen in this module: the caller supplies a trusted repository.
 * Existing Fitness, Life and Budgeting stores are intentionally untouched.
 */
const SLUG=/^[a-z][a-z0-9-]{1,40}$/;
const THREAD=/^[a-z][a-z0-9-]{1,40}-[A-Za-z0-9_-]{8,90}$/;
export function coachHistoryKey(coach, memberId, threadId) {
 if(typeof coach!=="string"||!SLUG.test(coach)||
    typeof memberId!=="string"||!/^user_[A-Za-z0-9_-]{8,128}$/.test(memberId)||
    typeof threadId!=="string"||!THREAD.test(threadId)||
    !threadId.startsWith(coach+"-")) return null;
 return Object.freeze({coach,memberId,threadId});
}
export function newCoachHistoryPort({coach,memberId,repo}) {
 if(!SLUG.test(coach||"")||typeof memberId!=="string"||
  !/^user_[A-Za-z0-9_-]{8,128}$/.test(memberId)||
  !repo||typeof repo.read!=="function"||typeof repo.save!=="function")
  return null;
 const keyFor=(threadId)=>coachHistoryKey(coach,memberId,threadId);
 return Object.freeze({
  read:async threadId=>{
   const key=keyFor(threadId);
   if(!key)return null;
   return repo.read(key);
  },
  save:async (threadId,requestKey,question,reply)=>{
   const key=keyFor(threadId);
   if(!key||!/^[A-Za-z0-9_-]{16,100}$/.test(requestKey||"")||
    typeof question!=="string"||!question.trim()||question.length>6000||
    typeof reply!=="string"||!reply.trim()||reply.length>10000)return "invalid";
   // Repository MUST commit both messages atomically, with a uniqueness
   // constraint on (coach, memberId, threadId, requestKey).
   return repo.save({...key,requestKey,question,reply});
  }
 });
}

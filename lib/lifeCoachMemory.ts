// Pure, model-free memory decisions. No network calls, database access, or secrets.
export type LifeMemoryEntry = { text: string; date: string };
export type LifeMemoryIntent = "recall" | "progress" | null;

const memoryReference = /\b(?:earlier|previous(?:ly)?|past|last (?:time|chat|conversation)|remember|remind me|told you|mentioned|discussed|talked about|we planned|we discussed|we talked|left off|pick up where)\b/i;
const goalStatement = /\b(?:my goal|my priority|i want to|i plan to|i aim to|i(?:'d| would) like to|i(?:'m| am) (?:trying|working|planning) to|i(?:'m| am) working on)\b/i;
const memoryQuestion = /\b(?:what|which|remind|recall|remember|tell me|do you know|did i|did we)\b/i;
const progressQuestion = /\b(?:progress|help me|how (?:can|do) i|let's|can we|work on|continue|next step|pick up|move forward|follow up|getting started)\b/i;
const requiresSpecialCare = /\b(?:suicid(?:al|e)|self[- ]?harm|kill myself|hurt(?:ing)? myself|overdose|starv(?:e|ing)|purging|abus(?:e|ive)|danger to myself)\b/i;
const wantsDetailedPlan = /\b(?:write|draft|design|build|create|detailed|comprehensive|7[- ]?day|weekly schedule|month[- ]?long)\b/i;
const filler = /^(?:ok(?:ay)?|thanks|thank you|yes|no|great|hello|hi|got it|sounds good)[.! ]*$/i;
const topicWords = new Set(["what","which","where","when","have","with","from","about","this","that","were","your","mine","ours","goal","goals","plan","plans","habit","habits","priority","priorities","earlier","previous","last","time","chat","conversation","remember","discussed","talked","tell","told","said","mentioned","help","progress","make","could","would","like","please","more","into","them","today","can","you","the","for","and","how","did","was"]);

export function isLifeRecallQuestion(query: string): boolean {
  return (memoryReference.test(query) && (memoryQuestion.test(query) || progressQuestion.test(query))) || /\b(?:what(?:\x27s| is| was) my (?:goal|goals|priority|plan)|what goals have i set|which goal did i)\b/i.test(query);
}
export function lifeMemoryIntent(query: string): LifeMemoryIntent {
  if (!isLifeRecallQuestion(query)) return null;
  if (requiresSpecialCare.test(query)) return null;
  // Complex plans need the actual coach; pass verified history to one model call.
  if (wantsDetailedPlan.test(query)) return null;
  return progressQuestion.test(query) ? "progress" : "recall";
}
export function isLifeGoalStatement(text: string): boolean {
  return goalStatement.test(text) && !isLifeRecallQuestion(text);
}
export function selectLifeMemories(query: string, entries: LifeMemoryEntry[], maxItems = 4): LifeMemoryEntry[] {
  const queryGoal = /\b(?:goal|goals|priority)\b/i.test(query);
  const words = (query.toLowerCase().match(/[a-z]{4,}/g) || []).filter(word => !topicWords.has(word));
  const candidates = entries.map((entry,index) => {
    const text = entry.text.trim().replace(/\s+/g," ").slice(0,450);
    const goal = isLifeGoalStatement(text);
    const relevant = words.reduce((acc,w) => acc + (text.toLowerCase().includes(w)?2:0),0);
    const score = relevant + (queryGoal && goal?12:0) + (text.length>15?1:0) - (isLifeRecallQuestion(text)?30:0) - (filler.test(text)?30:0);
    return {text,date:entry.date,index,score,goal};
  }).filter(entry=>entry.text.length>=9 && !isLifeRecallQuestion(entry.text) && !filler.test(entry.text));
  candidates.sort((a,b)=>b.score-a.score||a.index-b.index);
  return candidates.slice(0,Math.max(0,Math.min(maxItems,4))).map(({text,date})=>({text,date}));
}
export function lifeMemoryReply(query: string, entries: LifeMemoryEntry[]): string | null {
  const intent=lifeMemoryIntent(query);
  if (!intent) return null;
  const selected=selectLifeMemories(query,entries);
  const asksGoal=/\b(?:goal|goals|priority)\b/i.test(query);
  const fact=asksGoal
    ? selected.find(entry=>isLifeGoalStatement(entry.text))
    : selected[0];
  if (!fact) return "I couldn't find that detail in your saved Life Coach conversations. What would you like me to work from?";
  if (requiresSpecialCare.test(fact.text)) return null;
  const quoted=fact.text.replace(/\s+/g," ").trim();
  const first="You previously told me: “"+quoted+"”";
  if (intent==="recall") return first;
  if (/\btime management\b/i.test(quoted)) {
    return first+"\n\nTo make progress, choose your top priority for tomorrow and block 15 uninterrupted minutes for it. Afterwards, note what got in the way. Want to build a simple plan for the week?";
  }
  return first+"\n\nWe can start with one small, practical action toward it. Pick something achievable in 10–15 minutes and decide when you'll do it. Which first step feels realistic?";
}
export function guardLifeMemoryDenial(answer: string, query: string, entries: LifeMemoryEntry[]): string {
  if (!entries.length || !isLifeRecallQuestion(query)) return answer;
  const falseDenial=/\b(?:can'?t|cannot|don'?t|do not|unable to|no)\b.{0,70}\b(?:access|recall|remember|retrieve|see|look up|have)\b.{0,95}\b(?:past|earlier|previous|prior|other|history|conversation|chat|messages)\b/i;
  if (!falseDenial.test(answer)) return answer;
  const fact=selectLifeMemories(query,entries,1)[0];
  if (!fact || requiresSpecialCare.test(fact.text)) return answer;
  return "I do have a relevant note from our earlier conversations: “"+fact.text+"”\n\nWhat would you like to do with that today?";
}

// Deterministic private-pilot support when crisis language needs immediate
// guidance. Runs before provider/usage checks; never claims professional care.
export function urgentLifeCoachReply(message:string):string|null {
 const text=message.toLowerCase();
 const urgent=/(?:\b(?:suicide|suicidal|kill myself|end my life|take my life|hurt myself|harm myself|self[- ]?harm|overdose|want to die|don't want to live|do not want to live|can't go on living)\b)/i.test(text);
 if(!urgent)return null;
 const negation=/(?:\b(?:not|never|don't|do not|no longer)\s+(?:suicidal|thinking about suicide|want to die|thinking of hurting myself)\b)/i.test(text);
 if(negation&&!/(?:\b(?:now|tonight|today|right now|currently)\b.{0,45}\b(?:hurt myself|harm myself|kill myself|suicide|want to die)\b)/i.test(text))return null;
 return "I'm glad you told me. Your safety matters more than working on a goal right now. If you might act on these thoughts or are in immediate danger, contact local emergency services now. If you're in the US, you can call or text 988 for crisis support; elsewhere, contact your local crisis line. If possible, move away from anything you could use to hurt yourself and reach out to someone you trust who can stay with you. Are you safe right now?";
}

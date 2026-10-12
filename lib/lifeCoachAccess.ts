import { currentUser } from "@clerk/nextjs/server";

export async function lifeTester() {
  // Private sandbox is unavailable on the production website, regardless of configuration.
  if (process.env.VERCEL_ENV !== "preview") return null;
  const user=await currentUser();
  if(!user) return null;
  const ids=(process.env.LIFE_COACH_TESTER_IDS||"").split(",").map(x=>x.trim()).filter(Boolean);
  // Even signed-in paid members have NO access unless explicitly allowlisted.
  return ids.includes(user.id)?user.id:null;
}

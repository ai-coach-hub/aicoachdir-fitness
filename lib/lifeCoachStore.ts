import { selectLifeMemories } from "./lifeCoachMemory";
import { neon } from "@neondatabase/serverless";

export type LifeMessage = { role: "user" | "assistant"; text: string; createdAt: string };
export type LifeThread = { id: string; title: string; updatedAt: string };
const validId = (id: string) => /^life-coach-[a-zA-Z0-9_-]{8,90}$/.test(id);

function productionCutoverReady(){
 const cutover=String(process.env.SHARED_USAGE_CUTOVER_AT||"");
 const stamp=Date.parse(cutover);
 return Number.isFinite(stamp)&&new Date(stamp).toISOString()===cutover;
}
function database() {
  const isProduction=process.env.VERCEL_ENV==="production" &&
    process.env.SHARED_USAGE_GATE_ENABLED==="true" &&
    process.env.SHARED_USAGE_PUBLIC_RELEASE_APPROVED==="true" &&
    process.env.SHARED_USAGE_OPENING_BALANCES_RECONCILED==="true" &&
    productionCutoverReady() &&
    process.env.LIFE_COACH_LIVE_ENABLED==="true";
  const url=isProduction
    ? (process.env.STORAGE_URL||process.env.DATABASE_URL||process.env.POSTGRES_URL)
    : process.env.LIFE_COACH_DATABASE_URL;
  if (!url) throw new Error("Life Coach database is not configured");
  return neon(url);
}
// Fail closed if a preview points at the wrong Neon branch or environment.
const PRIVATE_PREVIEW_BRANCH = "feature/life-coach-agent-sandbox-20261011";
const PRIVATE_NEON_BRANCH_ID = "br-autumn-breeze-auw38rgr";
const PRODUCTION_NEON_BRANCH_ID = "br-sparkling-glitter-aucpz59d";

async function db() {
  const privatePreview=process.env.VERCEL_ENV==="preview" &&
    process.env.VERCEL_GIT_COMMIT_REF===PRIVATE_PREVIEW_BRANCH;
  const productionReleased=process.env.VERCEL_ENV==="production" &&
    process.env.SHARED_USAGE_GATE_ENABLED==="true" &&
    process.env.SHARED_USAGE_PUBLIC_RELEASE_APPROVED==="true" &&
    process.env.SHARED_USAGE_OPENING_BALANCES_RECONCILED==="true" &&
    productionCutoverReady() &&
    process.env.LIFE_COACH_LIVE_ENABLED==="true";
  if(!privatePreview&&!productionReleased)
    throw new Error("Life Coach storage is disabled until release");
  const sql=database();
  // Production must be migrated explicitly; never silently create tables
  // or reuse the private Life Coach Neon branch for live members.
  if(productionReleased){
    // Never read/write private Preview conversations if Production's database
    // connection is accidentally pointed at another Neon branch.
    const identity=await sql`SELECT current_setting('neon.branch_id', true) AS branch_id`;
    if(String(identity[0]?.branch_id||"")!==PRODUCTION_NEON_BRANCH_ID)
      throw new Error("Life Coach production database branch mismatch");
    return sql;
  }
  const identity = await sql`SELECT current_setting('neon.branch_id', true) AS branch_id`;
  if (String(identity[0]?.branch_id || "") !== PRIVATE_NEON_BRANCH_ID)
    throw new Error("Private Life Coach database branch mismatch");
  await sql`CREATE TABLE IF NOT EXISTS life_chat_threads (
    member_id TEXT NOT NULL, id TEXT NOT NULL, title TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (member_id,id)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS life_chat_messages (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    member_id TEXT NOT NULL, conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user','assistant')),
    body TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (member_id,conversation_id)
      REFERENCES life_chat_threads(member_id,id) ON DELETE CASCADE
  )`;
  return sql;
}
export async function listLifeThreads(member: string): Promise<LifeThread[]> {
  const sql = await db();
  const rows = await sql`SELECT id,title,updated_at FROM life_chat_threads
    WHERE member_id=${member} ORDER BY updated_at DESC LIMIT 50`;
  return rows.map(r=>({id:String(r.id),title:String(r.title),updatedAt:String(r.updated_at)}));
}
export async function readLifeThread(member: string, id: string): Promise<LifeMessage[]|null> {
  if(!validId(id)) return null;
  const sql = await db();
  const existing = await sql`SELECT id FROM life_chat_threads
    WHERE member_id=${member} AND id=${id} LIMIT 1`;
  if(!existing.length) return null;
  const rows = await sql`SELECT role,body,created_at FROM life_chat_messages
    WHERE member_id=${member} AND conversation_id=${id} ORDER BY id ASC LIMIT 200`;
  return rows.map(r=>({role:r.role as LifeMessage["role"],text:String(r.body),createdAt:String(r.created_at)}));
}
// Look up previous messages belonging to this authenticated Clerk member only.
// Filter out repetitive memory-quiz questions, prioritize original member goals,
// and never make a second model call to synthesize a memory summary.
export async function recallLifeStatements(member: string, currentId: string, query: string) {
  const sql=await db();
  const goalQuery=/\b(?:goal|goals|priority)\b/i.test(query);
  const rows=goalQuery
    ? await sql`SELECT body,created_at FROM life_chat_messages
       WHERE member_id=${member} AND conversation_id<>${currentId} AND role='user'
       AND (lower(body) LIKE '%my goal%' OR lower(body) LIKE '%my priority%'
         OR lower(body) LIKE '%i want to%' OR lower(body) LIKE '%i plan to%'
         OR lower(body) LIKE '%i am trying%' OR lower(body) LIKE '%i aim to%'
         OR lower(body) LIKE '%i would like%' OR lower(body) LIKE '%working on%')
       ORDER BY id DESC LIMIT 40`
    : await sql`SELECT body,created_at FROM life_chat_messages
       WHERE member_id=${member} AND conversation_id<>${currentId} AND role='user'
       ORDER BY id DESC LIMIT 80`;
  const entries=rows.map(row=>({text:String(row.body).slice(0,450),date:String(row.created_at).slice(0,10)}));
  return selectLifeMemories(query,entries);
}
export async function recallLifeContext(member: string, currentId: string, query: string) {
  const statements=await recallLifeStatements(member,currentId,query);
  return statements.map(row=>"["+row.date+"] Member: "+row.text).join("\n").slice(0,1450);
}
export async function saveLifeTurn(member: string,id: string,question: string,answer: string) {
  if(!validId(id)) throw new Error("Invalid Life Coach thread");
  const sql=await db();
  // One SQL statement is atomic: neither participant's message is saved
  // alone if inserting the other message fails. This also avoids publishing
  // a conversation shell for an incomplete turn.
  await sql`WITH thread AS (
    INSERT INTO life_chat_threads(member_id,id,title)
    VALUES(${member},${id},${question.slice(0,85)})
    ON CONFLICT(member_id,id) DO UPDATE SET updated_at=NOW()
    RETURNING member_id,id
  )
  INSERT INTO life_chat_messages(member_id,conversation_id,role,body)
  SELECT thread.member_id,thread.id,turn.role,turn.body
  FROM thread CROSS JOIN (VALUES
    ('user',${question.slice(0,6000)}),
    ('assistant',${answer.slice(0,10000)})
  ) AS turn(role,body)`;
}

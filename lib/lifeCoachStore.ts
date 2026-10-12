import { neon } from "@neondatabase/serverless";

export type LifeMessage = { role: "user" | "assistant"; text: string; createdAt: string };
export type LifeThread = { id: string; title: string; updatedAt: string };
const validId = (id: string) => /^life-coach-[a-zA-Z0-9_-]{8,90}$/.test(id);

function database() {
  const url = process.env.LIFE_COACH_DATABASE_URL;
  if (!url) throw new Error("Private Life Coach database is not configured");
  return neon(url);
}
async function db() {
  const sql = database();
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
export async function recallLifeContext(member: string, currentId: string, query: string) {
  const sql = await db();
  const terms=(query.toLowerCase().match(/[a-z0-9]{4,}/g)||[])
   .filter(w=>!["what","when","where","with","that","this","about","have","previous","remember","discussed","before","last","time","conversation","goal","coach"].includes(w))
   .slice(0,5);
  // General "what did I tell you earlier?" requests have no topic keyword.
  // Retrieve recent member statements for those requests, and fall back to them
  // when keyword matching finds nothing. This is a read-only DB lookup.
  const isRecallQuestion=/\\b(earlier|previous(?:ly)?|last (?:chat|conversation|time)|remember|told you|did i (?:say|tell)|we discussed)\\b/i.test(query);
  const rows=terms.length&&!isRecallQuestion
    ? await sql`SELECT body,created_at FROM life_chat_messages
        WHERE member_id=${member} AND conversation_id<>${currentId}
        AND role='user'
        AND EXISTS(SELECT 1 FROM unnest(${terms}::text[]) term
           WHERE lower(body) LIKE '%' || term || '%')
        ORDER BY created_at DESC,id DESC LIMIT 4`
    : [];
  const relevant=rows.length?rows:await sql`SELECT body,created_at FROM life_chat_messages
        WHERE member_id=${member} AND conversation_id<>${currentId}
        AND role='user' ORDER BY created_at DESC,id DESC LIMIT 4`;
  return relevant.map(r=>`[${String(r.created_at).slice(0,10)}] Member: ${String(r.body).slice(0,450)}`).join("\n").slice(0,2200);
}
export async function saveLifeTurn(member: string,id: string,question: string,answer: string) {
  if(!validId(id)) throw new Error("Invalid Life Coach thread");
  const sql=await db();
  await sql`INSERT INTO life_chat_threads(member_id,id,title)
     VALUES(${member},${id},${question.slice(0,85)})
     ON CONFLICT(member_id,id) DO UPDATE SET updated_at=NOW()`;
  await sql`INSERT INTO life_chat_messages(member_id,conversation_id,role,body)
     VALUES(${member},${id},'user',${question.slice(0,6000)})`;
  await sql`INSERT INTO life_chat_messages(member_id,conversation_id,role,body)
     VALUES(${member},${id},'assistant',${answer.slice(0,10000)})`;
}

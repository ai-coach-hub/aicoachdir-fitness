import { createHash, createHmac, randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";

const EXPECTED_BRANCH = "br-sparkling-glitter-aucpz59d";
const BUCKET = "coach-member-attachments";
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export function attachmentsEnabled() {
  return process.env.VERCEL_ENV === "production" &&
    process.env.COACH_ATTACHMENTS_API_ENABLED === "true";
}

function config() {
  if (!attachmentsEnabled()) throw new Error("Attachments disabled");
  const endpoint = process.env.COACH_ATTACHMENT_S3_ENDPOINT || "";
  const accessKey = process.env.COACH_ATTACHMENT_S3_KEY_ID || "";
  const secret = process.env.COACH_ATTACHMENT_S3_SECRET || "";
  const region = process.env.COACH_ATTACHMENT_S3_REGION || "us-east-1";
  const dbUrl = process.env.COACH_ATTACHMENT_DATABASE_URL || "";
  if (!endpoint.startsWith("https://br-sparkling-glitter-aucpz59d.storage.") ||
    !accessKey || !secret || !dbUrl) throw new Error("Private attachment storage is not configured");
  return { endpoint: endpoint.replace(/\/$/, ""), accessKey, secret, region, dbUrl };
}

function database() {
  return neon(config().dbUrl);
}

export async function attachmentDatabase() {
  const sql = database();
  const branch = await sql`SELECT current_setting('neon.branch_id',true) AS id`;
  if (branch[0]?.id !== EXPECTED_BRANCH) throw new Error("Attachment database branch mismatch");
  return sql;
}

function digest(data: string | Buffer) {
  return createHash("sha256").update(data).digest("hex");
}
function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}
function safeComponent(s: string) {
  return encodeURIComponent(s).replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}
function signingKey(secret: string, date: string, region: string) {
  return hmac(hmac(hmac(hmac("AWS4" + secret, date), region), "s3"), "aws4_request");
}
function stamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function storagePath(key: string) {
  return "/" + BUCKET + "/" + key.split("/").map(safeComponent).join("/");
}
function signature(method: string, path: string, time: Date, payloadHash: string, headers: string, headerNames: string, query = "") {
  const cfg = config(), date = stamp(time), day = date.slice(0, 8);
  const scope = `${day}/${cfg.region}/s3/aws4_request`;
  const canonical = [method, path, query, headers, headerNames, payloadHash].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", date, scope, digest(canonical)].join("\n");
  return { hex: createHmac("sha256", signingKey(cfg.secret, day, cfg.region)).update(stringToSign).digest("hex"), scope, date, cfg };
}

async function s3Request(method: "PUT" | "DELETE", key: string, bytes?: Buffer) {
  const cfg = config();
  const u = new URL(cfg.endpoint);
  const path = storagePath(key);
  const now = new Date();
  const payloadHash = digest(bytes || Buffer.alloc(0));
  const headers = `host:${u.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${stamp(now)}\n`;
  const signed = signature(method, path, now, payloadHash, headers, "host;x-amz-content-sha256;x-amz-date");
  const response = await fetch(cfg.endpoint + path, {
    method,
    headers: {
      "Authorization": `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${signed.scope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${signed.hex}`,
      "x-amz-date": signed.date,
      "x-amz-content-sha256": payloadHash,
      ...(bytes ? { "Content-Type": "image/jpeg" } : {}),
    },
    ...(bytes ? { body: new Uint8Array(bytes) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Private object storage returned HTTP ${response.status}`);
}

export async function storeImage(key: string, bytes: Buffer) {
  if (bytes.length < 100 || bytes.length > MAX_IMAGE_BYTES || !looksLikeJpeg(bytes)) {
    throw new Error("Invalid prepared JPEG");
  }
  await s3Request("PUT", key, bytes);
}
export async function removeImage(key: string) {
  await s3Request("DELETE", key);
}
function looksLikeJpeg(buf: Buffer) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8 || buf[buf.length - 2] !== 0xff ||
      buf[buf.length - 1] !== 0xd9) return false;
  // Check SOF segment dimensions, never trust MIME headers.
  let offset = 2;
  while (offset + 10 < buf.length) {
    if (buf[offset] !== 0xff) return false;
    const marker = buf[offset + 1];
    if (marker === 0xda) break;
    const len = buf.readUInt16BE(offset + 2);
    if (len < 2 || offset + 2 + len > buf.length) return false;
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      const height = buf.readUInt16BE(offset + 5), width = buf.readUInt16BE(offset + 7);
      return width >= 1 && height >= 1 && width <= 1600 && height <= 1600;
    }
    offset += len + 2;
  }
  return false;
}
export function signedPhotoUrl(key: string) {
  if (!/^member\/[a-f0-9]{64}\/[a-f0-9-]{36}\.jpg$/.test(key)) throw new Error("Unexpected object path");
  const cfg = config(), u = new URL(cfg.endpoint), time = new Date();
  const day = stamp(time).slice(0, 8), scope = `${day}/${cfg.region}/s3/aws4_request`;
  const params = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": cfg.accessKey + "/" + scope,
    "X-Amz-Date": stamp(time),
    "X-Amz-Expires": "120",
    "X-Amz-SignedHeaders": "host",
  });
  const query = [...params.entries()].map(([k,v]) => safeComponent(k) + "=" + safeComponent(v)).sort().join("&");
  const path = storagePath(key);
  const signed = signature("GET", path, time, "UNSIGNED-PAYLOAD", `host:${u.host}\n`, "host", query);
  return cfg.endpoint + path + "?" + query + "&X-Amz-Signature=" + signed.hex;
}
export function createPhotoKey(member: string) {
  return "member/" + digest(member.toLowerCase()) + "/" + randomUUID() + ".jpg";
}
export function photoId() { return randomUUID(); }

export async function authorizeAttachedPhoto(args: { id: string; email: string; coach: "fitness" | "life"; conversationId: string }) {
  if (!/^[a-f0-9-]{36}$/.test(args.id)) return null;
  const sql = await attachmentDatabase();
  const rows = await sql`
    SELECT object_key FROM public.coach_chat_attachments
    WHERE attachment_id = ${args.id}::uuid AND member_email = ${args.email}
      AND coach = ${args.coach} AND conversation_id = ${args.conversationId}
      AND expires_at > now()
    LIMIT 1
  `;
  if (!rows.length) return null;
  return signedPhotoUrl(String(rows[0].object_key));
}
// Cleanup is deliberately bounded and fail-closed: only delete rows AFTER
// confirming the private storage object is deleted. Called by new uploads.
// A separate scheduled maintenance path is required for strict time guarantees.
export async function purgeExpiredPhotos(limit = 20) {
  const sql = await attachmentDatabase();
  const expired = await sql`
    SELECT attachment_id, object_key FROM public.coach_chat_attachments
    WHERE expires_at <= now()
    ORDER BY expires_at ASC LIMIT ${Math.min(Math.max(limit, 1), 30)}
  `;
  let deleted = 0;
  for (const row of expired) {
    try {
      await removeImage(String(row.object_key));
      await sql`
        DELETE FROM public.coach_chat_attachments
        WHERE attachment_id = ${String(row.attachment_id)}::uuid AND expires_at <= now()
      `;
      deleted++;
    } catch {
      // Continue with other independent objects; never claim deletion of bytes
      // if storage failed. Do not log a member filename or object key.
    }
  }
  return deleted;
}

export function MAX_PREPARED_PHOTO_BYTES() { return MAX_IMAGE_BYTES; }

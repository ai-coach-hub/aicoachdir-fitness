import { currentUser } from "@clerk/nextjs/server";
import { memberHasFitnessAccess } from "@/lib/fitnessMembershipDb";
import {
  attachmentDatabase, attachmentsEnabled, createPhotoKey, MAX_PREPARED_PHOTO_BYTES,
  photoId, removeImage, storeImage, purgeExpiredPhotos,
} from "@/lib/coachAttachmentStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function result(data: unknown, status: number) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

// No credentials or member photos are available to the browser until the
// explicit preview-only rollout flag and private Neon storage are configured.
export async function GET(request: Request) {
  if (!attachmentsEnabled()) return result({ ok: false, error: "Private attachments are not enabled." }, 404);
  const member = await currentUser();
  const primary = member?.emailAddresses.find(e => e.id === member.primaryEmailAddressId);
  if (!member || !primary || primary.verification?.status !== "verified")
    return result({ ok: false, error: "Sign in with a verified email." }, 401);
  const email = primary.emailAddress.trim().toLowerCase();
  const authorizedOwners = (process.env.COACH_ATTACHMENT_OWNER_EMAILS || "")
    .split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  const isOwner = authorizedOwners.includes(email);
  const query = new URL(request.url).searchParams;
  const ownerView = query.get("scope") === "owner";
  if (ownerView && !isOwner)
    return result({ ok: false, error: "Owner access required." }, 403);
  if (!ownerView) {
    const memberAccess = await memberHasFitnessAccess(email, member.id).catch(() => false);
    if (!memberAccess) return result({ ok: false, error: "Membership required." }, 403);
  }
  let sql: Awaited<ReturnType<typeof attachmentDatabase>>;
  try { sql = await attachmentDatabase(); }
  catch { return result({ ok: false, error: "Storage database unavailable." }, 503); }
  const memberEmail = ownerView ? (query.get("member") || "").trim().toLowerCase() : email;
  if (!memberEmail || memberEmail.length > 250 || !/^\S+@\S+\.\S+$/.test(memberEmail))
    return result({ ok: false, error: "Valid member identifier required." }, 400);
  const id = query.get("id") || "";
  if (id && !/^[a-f0-9-]{36}$/.test(id))
    return result({ ok: false, error: "Invalid attachment identifier." }, 400);
  const rows = id
    ? await sql`
        SELECT attachment_id, filename, byte_size, coach, conversation_id, created_at, expires_at, object_key
        FROM public.coach_chat_attachments
        WHERE member_email = ${memberEmail} AND attachment_id = ${id}::uuid AND expires_at > now()
        LIMIT 1
      `
    : await sql`
        SELECT attachment_id, filename, byte_size, coach, conversation_id, created_at, expires_at
        FROM public.coach_chat_attachments
        WHERE member_email = ${memberEmail} AND expires_at > now()
        ORDER BY created_at DESC LIMIT 40
      `;
  if (id && !rows.length) return result({ ok: false, error: "Attachment not found." }, 404);
  if (id) {
    const { signedPhotoUrl } = await import("@/lib/coachAttachmentStorage");
    const photoUrl = signedPhotoUrl(String(rows[0].object_key));
    return result({ ok: true, photoUrl, expiresInSeconds: 120 }, 200);
  }
  return result({ ok: true, items: rows.map(row => ({
    id: row.attachment_id, name: row.filename, bytes: row.byte_size,
    coach: row.coach, conversationId: row.conversation_id,
    createdAt: row.created_at, expiresAt: row.expires_at,
  })) }, 200);
}

export async function DELETE(request: Request) {
  if (!attachmentsEnabled()) return result({ ok: false, error: "Private attachments are not enabled." }, 404);
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return result({ ok: false, error: "Invalid request origin." }, 403);
  const member = await currentUser();
  const primary = member?.emailAddresses.find(e => e.id === member.primaryEmailAddressId);
  if (!member || !primary || primary.verification?.status !== "verified")
    return result({ ok: false, error: "Verified sign in required." }, 401);
  const email = primary.emailAddress.trim().toLowerCase();
  const owners = (process.env.COACH_ATTACHMENT_OWNER_EMAILS || "")
    .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
  let payload: Record<string, unknown>;
  try { payload = await request.json(); }
  catch { return result({ ok: false, error: "Invalid deletion request." }, 400); }
  const id = typeof payload.id === "string" ? payload.id : "";
  const ownerTarget = typeof payload.member === "string" ? payload.member.trim().toLowerCase() : "";
  if (!/^[a-f0-9-]{36}$/.test(id) || (ownerTarget && !owners.includes(email)))
    return result({ ok: false, error: "Deletion not authorized." }, 403);
  const target = ownerTarget || email;
  if (!ownerTarget) {
    const access = await memberHasFitnessAccess(email, member.id).catch(() => false);
    if (!access) return result({ ok: false, error: "Membership required." }, 403);
  }
  const sql = await attachmentDatabase().catch(() => null);
  if (!sql) return result({ ok: false, error: "Storage unavailable." }, 503);
  const rows = await sql`
    SELECT object_key FROM public.coach_chat_attachments
    WHERE attachment_id = ${id}::uuid AND member_email = ${target}
    LIMIT 1
  `;
  if (!rows.length) return result({ ok: true, deleted: false }, 200);
  // Deleting private object bytes first means a failed database delete never
  // leaves a valid image; a later retry is safe because S3 deletion is idempotent.
  try {
    await removeImage(String(rows[0].object_key));
    await sql`
      DELETE FROM public.coach_chat_attachments
      WHERE attachment_id = ${id}::uuid AND member_email = ${target}
    `;
    return result({ ok: true, deleted: true }, 200);
  } catch {
    return result({ ok: false, error: "Deletion could not be verified. Retry safely." }, 503);
  }
}

export async function POST(request: Request) {
  if (!attachmentsEnabled()) return result({ ok: false, error: "Private attachments are not enabled." }, 404);
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return result({ ok: false, error: "Invalid request origin." }, 403);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_PREPARED_PHOTO_BYTES() + 100_000)
    return result({ ok: false, error: "Image too large." }, 413);

  const member = await currentUser();
  const primary = member?.emailAddresses.find(e => e.id === member.primaryEmailAddressId);
  if (!member || !primary || primary.verification?.status !== "verified")
    return result({ ok: false, error: "Sign in with a verified email." }, 401);
  const email = primary.emailAddress.trim().toLowerCase();
  let access = false;
  try { access = await memberHasFitnessAccess(email, member.id); }
  catch { return result({ ok: false, error: "Membership could not be checked." }, 503); }
  if (!access) return result({ ok: false, error: "Active membership required." }, 403);

  let form: FormData;
  try { form = await request.formData(); }
  catch { return result({ ok: false, error: "Invalid attachment request." }, 400); }
  const coach = form.get("coach");
  const conversationId = form.get("conversationId");
  const image = form.get("photo");
  if ((coach !== "fitness" && coach !== "life") ||
      typeof conversationId !== "string" ||
      !/^((fitness-chat|life-coach)-[A-Za-z0-9_-]{8,90})$/.test(conversationId) ||
      !(image instanceof File) || image.type !== "image/jpeg" ||
      image.size < 100 || image.size > MAX_PREPARED_PHOTO_BYTES())
    return result({ ok: false, error: "Unsupported attachment or conversation." }, 400);

  let sql: Awaited<ReturnType<typeof attachmentDatabase>>;
  try { sql = await attachmentDatabase(); }
  catch { return result({ ok: false, error: "Attachment storage unavailable." }, 503); }
  // Opportunistic bounded housekeeping; failures do not erase live references.
  await purgeExpiredPhotos().catch(() => 0);
  // Prevent accidental unbounded uploads from abusive or buggy clients.
  const count = await sql`
    SELECT count(*)::int AS total FROM public.coach_chat_attachments
    WHERE member_email = ${email} AND created_at > now() - interval '24 hours'
  `;
  if (Number(count[0]?.total || 0) >= 10)
    return result({ ok: false, error: "Daily attachment limit reached." }, 429);

  const id = photoId();
  const key = createPhotoKey(email);
  try {
    await storeImage(key, Buffer.from(await image.arrayBuffer()));
  } catch {
    return result({ ok: false, error: "Unable to securely save this image." }, 503);
  }
  try {
    await sql`
      INSERT INTO public.coach_chat_attachments
        (attachment_id, member_email, coach, conversation_id, filename, object_key, content_type, byte_size)
      VALUES (${id}::uuid, ${email}, ${coach}, ${conversationId},
              ${image.name.slice(0, 120)}, ${key}, 'image/jpeg', ${image.size})
    `;
  } catch {
    await removeImage(key).catch(() => {});
    return result({ ok: false, error: "Unable to record private attachment." }, 503);
  }
  return result({ ok: true, attachmentId: id, expiresInDays: 7 }, 201);
}

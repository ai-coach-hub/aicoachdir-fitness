import { currentUser } from "@clerk/nextjs/server";
import { memberHasFitnessAccess } from "@/lib/fitnessMembershipDb";
import {
  attachmentDatabase, attachmentsEnabled, createPhotoKey, MAX_PREPARED_PHOTO_BYTES,
  photoId, removeImage, storeImage,
} from "@/lib/coachAttachmentStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function result(data: unknown, status: number) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

// No credentials or member photos are available to the browser until the
// explicit preview-only rollout flag and private Neon storage are configured.
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

import { timingSafeEqual } from "node:crypto";
import { attachmentsEnabled, purgeExpiredPhotos } from "@/lib/coachAttachmentStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Production-only daily maintenance. Never delete a metadata row before
// the private object store confirms deletion of the corresponding bytes.
export async function GET(request: Request) {
  if (!attachmentsEnabled()) {
    return Response.json({ok:false,error:"Attachment retention is disabled."},{status:404});
  }
  const secret = process.env.CRON_SECRET || "";
  const expected = Buffer.from("Bearer " + secret);
  const actual = Buffer.from(request.headers.get("authorization") || "");
  if (secret.length < 24 || expected.length !== actual.length || !timingSafeEqual(expected,actual))
    return Response.json({ok:false,error:"Unauthorized."},{status:401});
  try {
    const deleted = await purgeExpiredPhotos(30);
    return Response.json({ok:true,deleted},{headers:{"Cache-Control":"no-store"}});
  } catch {
    return Response.json({ok:false,error:"Photo cleanup unavailable."},{status:503});
  }
}

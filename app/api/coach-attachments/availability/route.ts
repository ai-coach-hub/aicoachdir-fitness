import { attachmentsEnabled } from "@/lib/coachAttachmentStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// This endpoint shares only whether the private-photo API is activated.
// Member identity, signed URLs and storage credentials are never exposed.
export async function GET() {
  return Response.json(
    { enabled: attachmentsEnabled() },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

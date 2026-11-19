# Coach file attachments — isolated preview (Nov 19, 2026)

**Current status: TESTING ONLY, NOT CUSTOMER READY.** Fitness and Life now have a preview-gated private photo upload route, temporary image URLs, a member-accessible attachment history with deletion, and a plain-language privacy notice beside the attachment. Pressing Send deliberately shares it with the coach, without an extra agreement checkbox. Small TXT/CSV excerpts can be sent inside normal coach messages. PDFs, DOCX and XLSX still cannot be interpreted or sent. Owner access is not configured, Pickaxe photo/image dashboard visibility is unverified, scheduled deletion is absent, and no end-to-end paid model verification has occurred. Do not merge, promote, or advertise as ready. The newer sections below supersede the original preview-only descriptions.

## Historical phase 1: browser-only preview (superseded)

Initially this was a browser-only UI preview; no photo or document was uploaded in that earlier phase. The user wants members to attach photos **or other files** to get feedback from their existing AI coaches without unnecessary expenses.

## Initially implemented (Fitness first)

- Dedicated `/fitness/photo-preview` page, linked as **File attachment preview** from Fitness chat on this feature branch only. The path is retained for compatibility; it now supports general files.
- Accept one file: JPEG/PNG/WebP, PDF, DOCX, XLSX, CSV or TXT, up to 8 MB. Reject unsupported extensions and conflicting declared MIME types; for documents only metadata is shown (name/size/type), not contents. Future upload backend must validate actual document bytes server-side.
- For images, the browser decodes pixels, limits maximum input dimensions 7000 by 7000, resizes longer edge to 1600px, flattens alpha, and re-encodes as JPEG at 0.78 quality, capped at 2MB. Document bytes are not read, parsed, or uploaded.
- Canvas conversion drops original EXIF/GPS metadata. Only a temporary `blob:` preview URL exists inside the browser; cleanup revokes it on removal, replacement, and page unmount.
- Coaching note input capped at 1,200 characters.
- Send button explicitly **disabled** until secure transport AND document extraction/format-specific processing exist; clear notice says no file upload or Pickaxe interaction.
- Offline tests assert no network APIs or save calls in this preview, image constraints, and explicit preview navigation.

## Original implementation plan (historical; newer preview code described below)

Pickaxe Completions API `POST https://api.pickaxe.co/v1/completions` documents optional `imageUrls: string[]` consisting of HTTPS URLs that end in .png/.jpg/.jpeg/.webp/.gif, for supported multimodal models; that is an **image** route, not evidence of native PDF, Word or Excel processing. It does NOT document uploading raw bytes or browser blob/data URLs. See https://pickaxe.co/v1/documentation/completions. Pickaxe Claude 4.5 Haiku has advertised image input support, but actual behavior of the site's existing deployed Coach and Action sequence has not been verified without paid requests.

A privacy-safe end-to-end integration still needs:
1. Choose **private** storage or equivalent authorized server-side short-lived storage (no free public image URLs; public Blob is unsuitable for potentially sensitive member uploads). Free quota is usage-limited and Hobby is not a compliant home for a commercial production site. Storage has NOT been provisioned.
2. Store member-scoped asset metadata and expiry; add authenticated uploads with actual byte/signature checks, PDF/document security validation, maximum size, no arbitrary URL fetching, and limits per member. For documents, use secure text extraction with resource limits and user consent; never falsely claim the coach can read a file merely from its filename.
3. For photos, deliver a private image to Pickaxe via a **short-lived, signed HTTPS URL whose path ends with a supported extension**. Ensure it cannot be enumerated, has an expiry, and is served only for the short-lived external Pickaxe read; do not put secrets in the model prompt. Investigate external fetch behavior and consent first.
4. For documents, provide an explicitly identified, securely extracted text excerpt (within model token limits) to the coach; do not send private file URLs blindly. For images, forward verified `imageUrls` only to the *one existing* Pickaxe completion for an eligible verified subscriber, behind a rollout flag. Preserve mutation, quota, and no-retry rules. Reject images in the saved-plan mutation flow until separately tested.
5. Include member consent about third-party processing, retention/deletion, and no medical diagnosis. Do not store image bytes in chat history, logs, URLs, or the browser's sessionStorage.
6. Test with offline mocks first; obtain separate approval before a **single** charged end-to-end multimodal request. Plan image quotas and retention cleanup.

## Release boundaries

- Live `aicoachdir.com` remains unchanged; existing Fitness repair PR #256 is separate and unmerged.
- This feature is preview-only and requires no new monthly subscription.
- Do not merge to production until a secure upload backend and actual image delivery are implemented and independently verified.


## Progress after inline preview approval — short text/CSV bridge (Nov 19)

The inline **Add file** control in Fitness and Life Coach now supports local extraction of small **TXT and CSV** documents. The browser reads up to 16 KB of plain text and rejects files containing more than 3,500 characters, NUL/control bytes, or unsupported MIME/extension combinations. The excerpt is not uploaded when a file is chosen; it is included in the normal existing member message **only when the member explicitly presses Send** with their question. The source is wrapped as quoted untrusted member-provided data, not tool commands. Existing Pickaxe message IDs, usage meters and save-verification paths remain in use; no separate inference call is added. Following success, the attachment chip is cleared; on error it stays for safe deliberate retry.

- **Owner visibility:** text and CSV content should be visible in the Pickaxe conversation text because they are sent as part of the message, but that must still be checked in the owner's dashboard. The original file itself is *not* archived or uploaded by Pickaxe via this route.
- **Privacy:** the chip discloses that sent text will appear in conversation history. The site processes a copy of the excerpt in the ordinary chat POST after a deliberate Send. Avoid medical records, account numbers and private identifiers.
- **Photo, PDF, DOCX and XLSX:** these can be selected and previewed but cannot yet be sent. No secure private object store, per-member retention/deletion facility or approved attachment parser has been provisioned. A private Blob store is possible but **no new paid resource** has been authorized; imageUrls requires HTTPS images ending in a supported extension. Do not use global Studio knowledge-base uploads for member-owned private attachments because of possible cross-user knowledge contamination.
- **Production:** do not merge this draft PR yet. The full attachment feature is not complete. No paid Pickaxe end-to-end test or production deployment was made.


## Nov 19: preview-only private photo transport implemented

This is a **staged technical preview, not a customer launch**.

- A separate **private** Neon Object Storage bucket `coach-member-attachments-preview` was created on Neon preview branch `br-autumn-breeze-auw38rgr` in existing project `empty-base-81267482`. Production Neon tables and storage were not changed.
- An additive `coach_chat_attachments` table and indexes were created on that preview branch only. The corresponding reviewed SQL is under `migrations/20261119_coach_private_attachments_PREVIEW_ONLY.sql`. This stores metadata and an opaque private object key, **not** the file bytes.
- Branch-scoped, expiring Neon storage credentials and the isolated preview database URL were saved as encrypted Vercel project variables restricted to `feature/coach-photo-preview-20261119`. **Never log, copy, or publish them.** The public preview feature flag is on for the branch; production is disabled by exact environment and branch checks.
- `POST /api/coach-attachments` requires verified Clerk login, active membership, same-origin request, a prepared valid JPEG under 2 MiB and at most 10 uploads per member per rolling day. It stores the JPEG in the **private** bucket, then inserts a member- and conversation-scoped record; failed insert rolls back the object.
- `GET /api/coach-attachments` returns only the member's active, accessible metadata. A specific `id` request returns a 120-second S3-signed HTTPS URL with an image extension. `DELETE /api/coach-attachments` deletes the object bytes then its metadata after verified user and origin checks. **Owner view** is restricted to verified Clerk accounts explicitly allowlisted by `COACH_ATTACHMENT_OWNER_EMAILS` — **not configured yet**; owner access is NOT verified. A private history page is available at `/fitness/attachment-history`.
- The existing Fitness and Life Coach composers upload a photo **only after Send**, and pass a validated `attachmentId` alongside the ordinary message. The server looks up the current member and conversation's private object and appends its short-lived URL as Pickaxe `imageUrls`; the raw file and storage secret never enter the text prompt. Saved-plan mutation with photo is explicitly prohibited. For history, a non-secret attachment reference is included in the conversation and member-side photo bubbles use authenticated on-demand retrieval.
- Small TXT/CSV files still flow through bounded local text extraction. PDF/DOCX/XLSX files **still cannot be sent** or interpreted. Budgeting remains a separate Pickaxe-hosted chat surface and has not been integrated.
- Expired private photo objects are opportunistically purged in bounded batches when new uploads occur, and individuals can be deleted explicitly. **A scheduled retention worker is not yet configured**; do not promise guaranteed deletion exactly at seven days. Expiry prevents API access but does not by itself remove the private object bytes.
- The Fitness and Life image flow has passed automated regression checks and TypeScript compilation, but **NO authenticated real photo-to-Pickaxe completion, storage transfer or Pickaxe owner-dashboard attachment visibility has been independently verified**. Photo inputs have model-dependent costs even within the 400-message allowance. Do not merge/launch, contact customers with a ready claim, or trigger paid tests until these complete.
- Current preview commit `bc68d753fa888bddccf4c16294fd051ede518fea` — Vercel deployment `dpl_86E1hLuMstji3YdzyH3B4vukhPBn`, state READY, 696/696 offline regression tests passed. GitHub draft PR #257 remains unmerged and production unchanged.

## Nov 19: streamlined attachment sharing

- Following a successful member-reported iPhone photo test, removed the extra per-attachment agreement checkbox from Fitness and Life. A concise privacy disclosure remains next to ready attachments; selecting a file stays local until the member deliberately taps Send.
- Ready TXT/CSV and prepared photo selections enable Send immediately; preview-only unsupported document formats do not enable attachment sending.
- This is an interface simplification only. Storage access, expiration, Pickaxe relay, owner authorization boundaries, and production rollout controls are unchanged. Owner-dashboard photo visibility is still unverified; this is not a production release.

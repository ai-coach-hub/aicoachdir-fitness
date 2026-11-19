# Coach file attachments — isolated preview (Nov 19, 2026)

Status: browser-only UI preview; **NO photo or document is uploaded to our servers or Pickaxe**; no AI credits or production code change. The user's goal is to let members attach photos **or other files** to get feedback from their existing AI coaches while keeping costs down and protecting privacy.

## Implemented (Fitness first)

- Dedicated `/fitness/photo-preview` page, linked as **File attachment preview** from Fitness chat on this feature branch only. The path is retained for compatibility; it now supports general files.
- Accept one file: JPEG/PNG/WebP, PDF, DOCX, XLSX, CSV or TXT, up to 8 MB. Reject unsupported extensions and conflicting declared MIME types; for documents only metadata is shown (name/size/type), not contents. Future upload backend must validate actual document bytes server-side.
- For images, the browser decodes pixels, limits maximum input dimensions 7000 by 7000, resizes longer edge to 1600px, flattens alpha, and re-encodes as JPEG at 0.78 quality, capped at 2MB. Document bytes are not read, parsed, or uploaded.
- Canvas conversion drops original EXIF/GPS metadata. Only a temporary `blob:` preview URL exists inside the browser; cleanup revokes it on removal, replacement, and page unmount.
- Coaching note input capped at 1,200 characters.
- Send button explicitly **disabled** until secure transport AND document extraction/format-specific processing exist; clear notice says no file upload or Pickaxe interaction.
- Offline tests assert no network APIs or save calls in this preview, image constraints, and explicit preview navigation.

## Actual file-to-coach flow (NOT implemented; must remain disabled)

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

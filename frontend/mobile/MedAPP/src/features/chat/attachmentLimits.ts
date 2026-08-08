// The attachment limits, in ONE place, with NO imports.
//
// They live here rather than in ./api because `useComposerMedia` has to enforce
// them and ./api reaches `@/lib/config`, which throws at require time under Jest
// unless a suite mocks it (see the test-harness note in
// docs/api/inbox_service.md). A composer hook should not drag that in to learn
// what 8 MiB is.
//
// Every value mirrors a backend setting. If one changes there it changes here,
// and the tests below the fold check the pair rather than the number.

/** `INBOX_MAX_ATTACHMENT_BYTES`. 8 MiB, and the server answers 413 above it. */
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

/** `INBOX_MAX_ATTACHMENT_DURATION_MS`. Four hours; 422 above it. */
export const MAX_ATTACHMENT_DURATION_MS = 4 * 60 * 60 * 1000;

/** The schema's per-message cap. The composer's slot is single, so this is slack. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 8;

/**
 * The server's content-type allowlist, parameters stripped.
 *
 * Checked client-side for the same reason as the size: a 415 body reads
 * "content type application/x-msdownload is not accepted; allowed: …", which is
 * a correct sentence and not a thing to show someone who attached a file.
 */
export const ALLOWED_CONTENT_TYPES: readonly string[] = [
  "audio/m4a",
  "audio/x-m4a",
  "audio/mp4",
  "audio/aac",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];

/**
 * `audio/m4a; codecs=mp4a.40.2` is an accepted upload — expo-audio's
 * HIGH_QUALITY preset is spelled differently across platforms and pickers, and
 * rejecting a correct file for carrying a codec hint is the kind of failure that
 * gets diagnosed as "uploads are broken". Matches the server's own behaviour.
 */
export function isAllowedContentType(contentType: string | undefined): boolean {
  if (!contentType) return false;
  const bare = contentType.split(";")[0].trim().toLowerCase();
  return ALLOWED_CONTENT_TYPES.includes(bare);
}

/** "8 MB" — the cap in the units a file manager shows, for the refusal copy. */
export function formatByteCap(): string {
  return `${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB`;
}

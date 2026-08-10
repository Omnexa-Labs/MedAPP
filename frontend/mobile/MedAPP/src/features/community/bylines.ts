// How Community names a person, and what it draws when it cannot.
//
// ============================================================================
// ONE NULLABLE FIELD, SEVERAL DIFFERENT CLAIMS
// ============================================================================
// `authorName` is null for reasons that are NOT interchangeable, and the wrong
// label either deanonymises someone or tells the reader a lie about their
// intent. `authorUserId` is never a fallback in any of them: a raw UUID is a
// worse byline than none, and on anonymous content it deanonymises outright.
//
// These live in their own module rather than inside a screen because the reply
// rows, the parent rows and the post header all have to agree, and a second copy
// of this table is how they would stop agreeing.

/**
 * The byline for a POST.
 *
 *   anonymous       -> "Anonymous". The name is absent from the database, not
 *                      hidden by the client.
 *   lookup failed   -> "MedApp member". Someone real wrote it; we could not
 *                      resolve who at write time.
 *   resolved        -> the name.
 *
 * Calling a failed lookup "Anonymous" would tell the reader the author chose to
 * hide, which is a different claim from the one the data supports.
 */
export function bylineFor(authorName: string | null, isAnonymous: boolean): string {
  if (isAnonymous) return "Anonymous";
  return authorName ?? "MedApp member";
}

/**
 * The byline for a COMMENT or a REPLY.
 *
 * Comments have no anonymous mode, so there is exactly ONE un-named state here —
 * which is also why the API collapses "anonymous" and "lookup failed" into the
 * same null on `replyToName`: both mean "we cannot name this person".
 *
 * "Community member", not the post's "MedApp member", per the replies design
 * notes (Figma 1100:2367 / frame 1096:2353): it is deliberately a ROLE rather
 * than a name-shaped string, so it does not read as somebody actually called
 * that. It is also rendered in `on-surface-variant` where a real name gets
 * `on-surface` — a word difference AND a token difference, because the design
 * rules require that the distinction never rest on colour alone.
 */
export function commentByline(authorName: string | null): string {
  return authorName ?? "Community member";
}

/**
 * Initials for the avatar, or null.
 *
 * Derived from the STORED NAME ONLY, never from a byline fallback — so an
 * anonymous post and a failed lookup both yield null and `AvatarWithFallback`
 * drops to its silhouette. That is the intended third rung of BRAND's
 * photo -> initials -> silhouette chain and the design's un-named treatment:
 * initials cannot be derived from a null, and an empty coloured circle reads as
 * a broken image rather than a placeholder.
 *
 * Honorifics are stripped because "Dr. Adjoa Boateng" has to read as AB, not DA
 * — every clinician in the roster would otherwise share the same disc.
 */
export function initialsFor(authorName: string | null): string | null {
  if (!authorName) return null;
  const words = authorName
    .replace(/^(dr|prof|mr|mrs|ms|miss)\.?\s+/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return null;
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

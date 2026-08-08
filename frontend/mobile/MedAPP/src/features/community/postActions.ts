// Post mutations — like, bookmark, report, delete — with optimistic cache
// updates and ROLLBACK.
//
// ============================================================================
// WHY THIS FILE EXISTS: the Like button was a lie
// ============================================================================
// The feed card's Like was `setLiked(v => !v)`. It never called the network,
// `reactToPost` had been in the client since it was written and was called from
// nowhere, and the filled heart survived exactly as long as the component did.
// A user liked a post, scrolled, came back, and their like was gone. Bookmark
// was the same control with a different glyph.
//
// So the rule this file enforces: initial state comes from the SERVER
// (`likedByMe` / `bookmarkedByMe` on `PostOut`), the tap issues a request, and a
// request that fails puts the UI back where it was. An optimistic update without
// a rollback is the same lie with extra steps — it just takes a flaky network
// instead of a remount to expose it.
//
// ============================================================================
// THE CACHE IS PATCHED IN EVERY PLACE THE POST APPEARS, NOT JUST ONE
// ============================================================================
// The same post is cached under up to three keys at once: the feed's infinite
// query, the saved-posts infinite query, and its own single-post query. Liking
// from the detail screen and going back to a feed card still showing an empty
// heart is the identical defect, one layer up. `patchPost` therefore walks every
// query under `socialKeys.all` and updates whichever copies it finds, and
// `snapshotSocial`/`restoreSocial` capture and undo exactly that set.
//
// The walk handles the three cached SHAPES — an infinite page list, a bare page,
// and a single post — and ignores anything else it meets (the comment lists live
// under the same root). Matching is on `id` PLUS the presence of `likeCount`, so
// a comment whose id collided with a post id could not be patched by accident.

import { useCallback } from "react";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { communityApi, socialKeys, type Page, type Post } from "./api";

// ---------------------------------------------------------------------------
// Cache shapes
// ---------------------------------------------------------------------------

interface InfiniteShape<T> {
  pages: Page<T>[];
  pageParams: unknown[];
}

function isInfinite(data: unknown): data is InfiniteShape<unknown> {
  return Boolean(data) && Array.isArray((data as InfiniteShape<unknown>).pages);
}

function isPage(data: unknown): data is Page<unknown> {
  return Boolean(data) && Array.isArray((data as Page<unknown>).items);
}

/** A cached POST, as opposed to a cached comment that happens to share an id. */
function isPost(value: unknown, postId: string): value is Post {
  const candidate = value as Post | null | undefined;
  return (
    Boolean(candidate) && candidate?.id === postId && typeof candidate?.likeCount === "number"
  );
}

type PostEdit = (post: Post) => Post;

/**
 * Apply `edit` to every copy of `postId` inside one cached value, whatever
 * shape it is in. Returns the input untouched when there is nothing to change,
 * so react-query does not re-render lists that did not move.
 */
export function editPostIn<T>(data: T, postId: string, edit: PostEdit): T {
  if (isInfinite(data)) {
    // Rebuild only if a page actually moved. Mapping unconditionally returns a
    // fresh wrapper every time, which re-renders every infinite list under
    // `socialKeys.all` on every like — including the comment lists this is
    // supposed to leave alone. The page identity below carries the same
    // guarantee up to the wrapper.
    let changed = false;
    const pages = data.pages.map((page) => {
      const next = editPostIn(page, postId, edit);
      if (next !== page) changed = true;
      return next;
    });
    return changed ? ({ ...data, pages } as T) : data;
  }
  if (isPage(data)) {
    let changed = false;
    const items = data.items.map((item) => {
      if (!isPost(item, postId)) return item;
      changed = true;
      return edit(item);
    });
    return changed ? ({ ...data, items } as T) : data;
  }
  if (isPost(data, postId)) return edit(data) as T;
  return data;
}

/** Drop every copy of `postId` from any cached LIST. A single-post cache entry is left alone. */
export function removePostIn<T>(data: T, postId: string): T {
  if (isInfinite(data)) {
    let changed = false;
    const pages = data.pages.map((page) => {
      const next = removePostIn(page, postId);
      if (next !== page) changed = true;
      return next;
    });
    return changed ? ({ ...data, pages } as T) : data;
  }
  if (isPage(data)) {
    const items = data.items.filter((item) => !isPost(item, postId));
    return items.length === data.items.length ? data : ({ ...data, items } as T);
  }
  return data;
}

type Snapshot = [readonly unknown[], unknown][];

/** Everything this feature has cached, for an exact undo. */
function snapshotSocial(qc: QueryClient): Snapshot {
  return qc.getQueriesData({ queryKey: socialKeys.all }) as Snapshot;
}

function restoreSocial(qc: QueryClient, snapshot: Snapshot | undefined) {
  // `setQueryData` per key, not a blanket invalidate: the point of a rollback is
  // to restore the state the user was looking at, immediately and without a
  // network round trip that could fail the same way the mutation just did.
  for (const [key, data] of snapshot ?? []) qc.setQueryData(key, data);
}

function patchPost(qc: QueryClient, postId: string, edit: PostEdit) {
  qc.setQueriesData({ queryKey: socialKeys.all }, (data: unknown) =>
    editPostIn(data, postId, edit),
  );
}

function dropPost(qc: QueryClient, postId: string) {
  qc.setQueriesData({ queryKey: socialKeys.all }, (data: unknown) => removePostIn(data, postId));
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export interface PostActionOptions {
  /** The signed-in user, for the per-viewer cache keys. */
  viewerId: string | null | undefined;
  /**
   * Shown to the user when a mutation fails. REQUIRED, not optional: every
   * network mutation in this feature needs an error path the user can see, and
   * an optional callback is one a caller forgets to pass.
   */
  onError: (message: string) => void;
}

/**
 * Like / unlike, optimistic, with rollback.
 *
 * The count moves by one in the direction of the tap. It is a REACTION count
 * server-side — every reaction type feeds it, not just "like" — so ±1 is right
 * for this viewer's own toggle even though the total means something broader
 * than the heart implies.
 */
export function useLikeToggle({ onError }: PostActionOptions) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, next }: { postId: string; next: boolean }) =>
      next ? communityApi.reactToPost(postId) : communityApi.unreactToPost(postId),
    onMutate: async ({ postId, next }) => {
      // In-flight reads would otherwise land after the patch and overwrite it.
      await qc.cancelQueries({ queryKey: socialKeys.all });
      const snapshot = snapshotSocial(qc);
      patchPost(qc, postId, (p) => ({
        ...p,
        likedByMe: next,
        // Clamped at 0: a stale `likeCount: 0` plus an unlike would otherwise
        // render "-1" reactions, which is not a state the server can produce.
        likeCount: Math.max(0, p.likeCount + (next ? 1 : -1)),
      }));
      return { snapshot };
    },
    onError: (_error, _vars, context) => {
      restoreSocial(qc, context?.snapshot);
      onError("Couldn't update your reaction. Check your connection and try again.");
    },
    // Deliberately NO invalidate on success. Both routes are idempotent and the
    // optimistic delta is exactly what the server now holds, so a refetch would
    // buy a redundant round trip per tap and — on the feed — re-render every
    // loaded page under the user's thumb.
  });
}

/** Save / unsave, same contract as the like toggle. */
export function useBookmarkToggle({ viewerId, onError }: PostActionOptions) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, next }: { postId: string; next: boolean }) =>
      next ? communityApi.bookmarkPost(postId) : communityApi.unbookmarkPost(postId),
    onMutate: async ({ postId, next }) => {
      await qc.cancelQueries({ queryKey: socialKeys.all });
      const snapshot = snapshotSocial(qc);
      patchPost(qc, postId, (p) => ({ ...p, bookmarkedByMe: next }));
      // Unsaving from inside the Saved screen must remove the row there and
      // then, or the user unsaves something and it stays on the list.
      if (!next) {
        qc.setQueriesData({ queryKey: socialKeys.bookmarks(viewerId) }, (data: unknown) =>
          removePostIn(data, postId),
        );
      }
      return { snapshot };
    },
    onError: (_error, _vars, context) => {
      restoreSocial(qc, context?.snapshot);
      onError("Couldn't update your saved posts. Check your connection and try again.");
    },
    onSuccess: () => {
      // Unlike a like, MEMBERSHIP of a list changed, and the saved list is
      // ordered by when each post was saved — an order only the server knows.
      void qc.invalidateQueries({ queryKey: socialKeys.bookmarks(viewerId) });
    },
  });
}

/**
 * Report a post.
 *
 * NOT optimistic. One report flags the item outright and there is no un-flag
 * route, so this is the least reversible thing a reader can do in the product;
 * showing it as done before the server agrees would be the wrong direction to
 * be wrong in. On success the post is dropped from every cached list, because
 * the feed genuinely will not return it again.
 */
export function useReportPost({ onError }: PostActionOptions) {
  return useMutation({
    mutationFn: ({ postId, reason, note }: { postId: string; reason: string; note?: string }) =>
      communityApi.reportPost(postId, reason, note),
    // NO cache change on success, and that is not an omission.
    //
    // Dropping the post here removes the feed row, which UNMOUNTS the card, its
    // sheet, and the acknowledgement the sheet is at that moment showing — so
    // the one screen that explains why the post is about to vanish would be
    // destroyed by the vanishing. The removal is `useDropPostFromLists` below
    // and runs when the user dismisses that acknowledgement.
    onError: () => onError("Couldn't send the report. Check your connection and try again."),
  });
}

/**
 * Remove a post from every cached list, and re-sync those lists with the
 * server.
 *
 * Separate from the report mutation so the caller controls WHEN the row
 * disappears — after the user has read why. See `useReportPost`.
 */
export function useDropPostFromLists({ viewerId }: Pick<PostActionOptions, "viewerId">) {
  const qc = useQueryClient();
  return useCallback(
    (postId: string) => {
      dropPost(qc, postId);
      void qc.invalidateQueries({ queryKey: socialKeys.feed(viewerId) });
      void qc.invalidateQueries({ queryKey: socialKeys.bookmarks(viewerId) });
    },
    [qc, viewerId],
  );
}

/**
 * Report a comment. Flags it, which drops it from the list AND from
 * `commentCount`.
 *
 * Works unchanged on a REPLY, and the blanket `socialKeys.all` invalidate is why:
 * flagging a reply removes it from `GET /comments/{parent}/replies` and
 * decrements the parent's `replyCount` in the same breath, and every reply cache
 * is keyed under that root. A narrower key would leave a thread showing "View 3
 * replies" over two rows.
 */
export function useReportComment({ onError }: Pick<PostActionOptions, "onError">) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, reason }: { commentId: string; postId: string; reason: string }) =>
      communityApi.reportComment(commentId, reason),
    onSuccess: (_data, { postId }) => {
      void qc.invalidateQueries({ queryKey: socialKeys.comments(postId) });
      // `comment_count` moved with it — both filter to approved server-side, so
      // the list and the number must be refetched together or they disagree.
      void qc.invalidateQueries({ queryKey: socialKeys.all });
    },
    onError: () => onError("Couldn't send the report. Check your connection and try again."),
  });
}

/**
 * Delete your own post. HARD delete, author only, 403 for anyone else.
 *
 * The 403 is worth a distinct message: it means the client's ownership check
 * and the server's disagree, which is a bug, not a network blip, and "try
 * again" would be useless advice.
 */
export function useDeletePost({ viewerId, onError }: PostActionOptions) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId }: { postId: string }) => communityApi.deletePost(postId),
    onSuccess: (_data, { postId }) => {
      dropPost(qc, postId);
      qc.removeQueries({ queryKey: socialKeys.post(viewerId, postId) });
      void qc.invalidateQueries({ queryKey: socialKeys.feed(viewerId) });
      void qc.invalidateQueries({ queryKey: socialKeys.bookmarks(viewerId) });
    },
    onError: (error: unknown) =>
      onError(
        isForbidden(error)
          ? "Only the author can delete this post."
          : "Couldn't delete the post. Check your connection and try again.",
      ),
  });
}

/**
 * Delete your own comment.
 *
 * HARD, and on a top-level comment it takes every reply with it — other people's
 * writing included. There is no tombstone and no "[deleted]" placeholder, so the
 * thread simply becomes shorter; the `socialKeys.all` invalidate is what makes
 * the open thread and both counts agree about that afterwards.
 */
export function useDeleteComment({ onError }: Pick<PostActionOptions, "onError">) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, commentId }: { postId: string; commentId: string }) =>
      communityApi.deleteComment(postId, commentId),
    onSuccess: (_data, { postId }) => {
      void qc.invalidateQueries({ queryKey: socialKeys.comments(postId) });
      void qc.invalidateQueries({ queryKey: socialKeys.all });
    },
    onError: (error: unknown) =>
      onError(
        isForbidden(error)
          ? "Only the author can delete this comment."
          : "Couldn't delete the comment. Check your connection and try again.",
      ),
  });
}

/**
 * A 403 from the ownership check.
 *
 * Duck-typed on `status` rather than on an error class: `@/lib/api/client`
 * rejects with its own error shape and this feature should not care which one,
 * only whether the server said "not yours". Ownership failures are 403 and
 * NEVER 404 in this service, by design — a 404 would tell an author their own
 * content had vanished.
 */
function isForbidden(error: unknown): boolean {
  return (error as { status?: number } | null)?.status === 403;
}

export const __testables = { editPostIn, removePostIn, isForbidden };

// The optimistic-cache surgery behind like, bookmark, report and delete.
//
// These are pure functions on purpose. The same post is cached under up to
// three keys at once — the feed's infinite query, the saved list, and its own
// single-post entry — and a patch that understood only one of those shapes
// would leave the feed card and the detail screen disagreeing about whether the
// user liked something. Testing them through a screen would exercise ONE shape
// per test at ten times the cost.

jest.mock("@/lib/api/client", () => ({
  client: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  registerAuthTokenProvider: jest.fn(),
  registerDeviceIdProvider: jest.fn(),
}));

import { __testables } from "../postActions";
import type { Post } from "../api";

const { editPostIn, removePostIn, isForbidden } = __testables;

const post = (id: string, over: Partial<Post> = {}): Post =>
  ({
    id,
    likeCount: 3,
    commentCount: 0,
    likedByMe: false,
    bookmarkedByMe: false,
  }) as Post;

const infinite = (...ids: string[]) => ({
  pages: [{ items: ids.map((id) => post(id)), nextOffset: null }],
  pageParams: [0],
});

describe("editPostIn", () => {
  it("patches inside an infinite page list", () => {
    const next = editPostIn(infinite("p-1", "p-2"), "p-1", (p) => ({ ...p, likedByMe: true }));
    expect(next.pages[0].items[0].likedByMe).toBe(true);
    expect(next.pages[0].items[1].likedByMe).toBe(false);
  });

  it("patches a single cached post", () => {
    const next = editPostIn(post("p-1"), "p-1", (p) => ({ ...p, likeCount: 4 }));
    expect(next.likeCount).toBe(4);
  });

  it("returns the SAME object when nothing matched, so untouched lists do not re-render", () => {
    const data = infinite("p-2");
    expect(editPostIn(data, "p-1", (p) => p).pages[0]).toBe(data.pages[0]);
  });

  it("ignores a comment list cached under the same root", () => {
    // Comments live under `["social", "comments", id]`, which the patcher walks.
    // Matching on id alone would let a comment be edited as though it were a
    // post; the `likeCount` check is what stops that.
    const comments = { pages: [{ items: [{ id: "p-1", body: "hi" }], nextOffset: null }] };
    expect(editPostIn(comments, "p-1", (p) => ({ ...p, likeCount: 99 }))).toBe(comments);
  });

  it("leaves anything it does not recognise alone", () => {
    expect(editPostIn(null, "p-1", (p) => p)).toBeNull();
    expect(editPostIn(undefined, "p-1", (p) => p)).toBeUndefined();
  });
});

describe("removePostIn", () => {
  it("drops the post from every page of a list", () => {
    const next = removePostIn(infinite("p-1", "p-2"), "p-1");
    expect(next.pages[0].items.map((p) => p.id)).toEqual(["p-2"]);
  });

  it("leaves a single cached post alone — that entry is the screen showing it", () => {
    const single = post("p-1");
    expect(removePostIn(single, "p-1")).toBe(single);
  });
});

describe("isForbidden", () => {
  it("recognises the 403 that ownership failures return — never a 404", () => {
    // A 404 would tell an author their own content had vanished, so the service
    // raises 403 and this is the only status worth a different message.
    expect(isForbidden({ status: 403 })).toBe(true);
    expect(isForbidden({ status: 404 })).toBe(false);
    expect(isForbidden(new Error("offline"))).toBe(false);
    expect(isForbidden(null)).toBe(false);
  });
});

// The deep link held across sign-in.
//
// Two things are being locked, and only one of them is the feature:
//
//   1. a signed-out recipient of a shared post reaches the post, not Home.
//   2. this slot can never become an open redirect, and can never be spent
//      twice. The app has already shipped a deep link that granted a session
//      (the deleted `zp*` routes); the guard rails here are the reason this one
//      cannot drift into the same thing.

import { clearPendingLink, rememberPendingLink, takePendingLink } from "../pending-link";

beforeEach(() => clearPendingLink());

describe("the round trip a shared link makes through sign-in", () => {
  it("returns the post the recipient actually tapped, id intact", () => {
    // What `(app)/_layout.tsx` sees for `medapp://post-detail?id=p-42` before
    // it redirects: the group is already stripped from the pathname.
    rememberPendingLink("/post-detail", { id: "p-42" });
    expect(takePendingLink()).toBe("/post-detail?id=p-42");
  });

  it("keeps each detail screen's own param name", () => {
    rememberPendingLink("/hospital-detail", { hospitalId: "h-1" });
    expect(takePendingLink()).toBe("/hospital-detail?hospitalId=h-1");
  });

  it("takes the first value of a repeated key, as the screens themselves do", () => {
    // A joined array interpolates as "a,b" and 404s — the same normalisation
    // PharmacyDetailScreen documents on its own params.
    rememberPendingLink("/pharmacy-detail", { pharmacyId: ["ph-1", "ph-2"] });
    expect(takePendingLink()).toBe("/pharmacy-detail?pharmacyId=ph-1");
  });

  it("drops params the router reports as absent", () => {
    rememberPendingLink("/post-detail", { id: "p-42", ref: undefined });
    expect(takePendingLink()).toBe("/post-detail?id=p-42");
  });

  it("is empty when nothing was remembered — sign-in falls through to home", () => {
    expect(takePendingLink()).toBeNull();
  });

  it("is ONE SHOT, so the next sign-in does not replay the same post", () => {
    rememberPendingLink("/post-detail", { id: "p-42" });
    expect(takePendingLink()).toBe("/post-detail?id=p-42");
    expect(takePendingLink()).toBeNull();
  });

  it("keeps only the most recent target", () => {
    rememberPendingLink("/post-detail", { id: "p-1" });
    rememberPendingLink("/post-detail", { id: "p-2" });
    expect(takePendingLink()).toBe("/post-detail?id=p-2");
  });
});

describe("what it refuses to remember", () => {
  it.each([
    ["a foreign scheme", "https://evil.example/steal"],
    ["a protocol-relative host", "//evil.example/steal"],
    ["another app's scheme", "othermedapp://post-detail"],
    ["a relative path that is not rooted", "post-detail"],
    ["nothing at all", ""],
  ])("refuses %s", (_label, href) => {
    rememberPendingLink(href, { id: "p-42" });
    // Refusal costs one redirect to Home. Honouring it costs an open redirect
    // out of the app, carried out immediately after a successful sign-in.
    expect(takePendingLink()).toBeNull();
  });
});

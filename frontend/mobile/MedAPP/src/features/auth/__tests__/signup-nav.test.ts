// The wizard's back affordance, and the rule that produced it.
//
// On a real device: clear the app's data, relaunch, and the app came up on
// `/(public)/sign-up-step-2` with a red toast reading "The action 'GO_BACK' was
// not handled by any navigator". Expo Go reopens the last URL it was pointed at
// and keeps that outside the app sandbox, so clearing MedApp's data wiped the
// sign-up draft but not the pending link — and `app/index.tsx` never ran,
// because index was not the route being opened.
//
// Two faults compounded, and both are asserted here:
//   1. a guard that ran in an effect painted a draftless form before bouncing;
//   2. the painted screen's back chevron called `router.back()` on a stack with
//      nothing under it.
//
// The source-level assertions at the bottom are deliberate. `goBackOr` being
// correct is worth nothing if a route stops calling it, and that regression is
// invisible to a unit test of this module.

import { readFileSync } from "fs";
import { join } from "path";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn() },
}));

import { router } from "expo-router";
import { goBackOr } from "../signup-nav";

const canGoBack = router.canGoBack as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe("goBackOr", () => {
  it("pops when there is a stack, and does not navigate anywhere new", () => {
    canGoBack.mockReturnValue(true);
    goBackOr("/(public)/sign-up-verify");
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("replaces when the stack is empty, instead of dispatching GO_BACK", () => {
    // The device case: a cold launch straight onto a wizard step. `back()` here
    // is what surfaced the red toast, so it must not be reached at all.
    canGoBack.mockReturnValue(false);
    goBackOr("/(public)/sign-up-verify");
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/(public)/sign-up-verify");
  });

  it("replaces, never pushes — a back affordance must not grow the stack", () => {
    canGoBack.mockReturnValue(false);
    goBackOr("/(public)/sign-up");
    expect(router.replace).toHaveBeenCalledWith("/(public)/sign-up");
  });
});

// ---------------------------------------------------------------------------
// The routes have to keep using it
// ---------------------------------------------------------------------------

const ROUTES = ["sign-up-verify.tsx", "sign-up-step-2.tsx", "sign-up-step-3.tsx"] as const;

/** Route source with comments stripped, so the prose explaining the fix cannot satisfy a matcher. */
const source = (file: string) =>
  readFileSync(join(__dirname, "..", "..", "..", "app", "(public)", file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

describe.each(ROUTES)("%s", (file) => {
  it("routes its back affordance through goBackOr", () => {
    const text = source(file);
    expect(text).toMatch(/goBackOr\(/);
    // A bare `router.back()` is the defect. `goBackOr` may call it internally,
    // but a route must not.
    expect(text).not.toMatch(/router\.back\(\)/);
  });

  it("guards with <Redirect>, not with a post-paint effect", () => {
    const text = source(file);
    expect(text).toMatch(/<Redirect\s+href=/);
    // `useEffect` + `router.replace` is what let a draftless step render for a
    // frame before bouncing.
    expect(text).not.toMatch(/useEffect/);
  });
});

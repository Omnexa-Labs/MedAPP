// Test-only helper: assert that nothing on a rendered screen ANNOUNCES itself
// as a button without being one.
//
// ---------------------------------------------------------------------------
// WHY THIS IS A SHARED HELPER AND NOT A PER-SCREEN ASSERTION
// ---------------------------------------------------------------------------
// The dead-control audit of 2026-08-07 found nineteen of them across two patient
// screens. Every single one looked identical in source to a working control —
// `<Pressable accessibilityRole="button" accessibilityLabel="…" hitSlop={6}
// className="… active:scale-95">` — and differed only in the absence of one
// prop. Some had a handler that was literally `() => {}`. One component
// (`InputTrigger`) took no `onPress` prop at all, so its two call sites could
// not have been wired even deliberately.
//
// Not one of them failed a test, because a test that renders a screen and finds
// its buttons finds the dead ones too. Rendering is not the property that
// matters; DOING SOMETHING when pressed is.
//
// So this asserts the class mechanically. It is a blunt instrument on purpose:
// it does not care WHERE a control goes, only that pressing it is observable.
// A screen that adds a new button gets checked for free, which is the one thing
// nineteen individually-correct-looking call sites needed.
//
// ---------------------------------------------------------------------------
// WHAT "OBSERVABLE" MEANS HERE
// ---------------------------------------------------------------------------
// A press is observable if it reaches SOMETHING the caller is watching: a
// router mock, a mutation spy, a state change the tree re-renders. The caller
// supplies the watchers as `probes` and this helper reports, per button,
// whether any of them moved.
//
// That deliberately cannot distinguish "no handler" from "a handler that does
// nothing the test can see" — and it should not. `onPress={() => {}}` was one
// of the shipped defects, and from the patient's side it is the same control as
// no handler at all. A button whose effect no test can observe is either dead
// or untested, and both are worth failing on.
//
// Two kinds of control are legitimately inert, and both are exempted BY NAME
// via `expectedInert` so the exemption is written down and justified rather
// than inferred:
//
//   * a control whose whole effect is local component state (a toggle whose
//     only job is its own appearance);
//   * a control that is deliberately a no-op in this state — the bottom nav's
//     ACTIVE tab, which PatientShell short-circuits because re-navigating to the
//     screen you are already on is a wasted frame.
//
// Neither is a dead control, but neither can move a probe, so they have to be
// named. A list that grows is a signal in itself.

import { fireEvent, type RenderResult } from "@testing-library/react-native";

export interface LiveControlOptions {
  /**
   * The spies a press may legitimately move — router mocks, api mocks,
   * anything. Any one of them registering a new call counts as "this button
   * did something".
   */
  probes: jest.Mock[];
  /**
   * Accessible names of buttons that legitimately move no probe — local-state
   * toggles, and the bottom nav's active tab. Each entry is an exemption
   * someone had to type, which is the point: the default is that a button must
   * be observable.
   */
  expectedInert?: string[];
}

/**
 * Press every `accessibilityRole="button"` in the tree and return the accessible
 * names of the ones that did nothing.
 *
 * Returns rather than asserts so a caller can put the list in its own
 * expectation and get the offending labels printed in the failure message —
 * "expected [] but got ['Pharmacy', 'Labs', 'Why this?']" names the defect
 * directly, which a bare `toBe(true)` would not.
 */
export function findDeadControls(
  view: Pick<RenderResult, "getAllByRole">,
  { probes, expectedInert = [] }: LiveControlOptions,
): string[] {
  const buttons = view.getAllByRole("button");
  const dead: string[] = [];

  for (const button of buttons) {
    const name =
      (button.props.accessibilityLabel as string | undefined) ??
      (button.props.accessibilityValue?.text as string | undefined) ??
      "<unlabelled button>";
    if (expectedInert.includes(name)) continue;

    // Snapshot before, compare after. Counting rather than clearing means a
    // caller's own `beforeEach` mocks stay intact and this helper can be used
    // mid-test.
    const before = probes.map((p) => p.mock.calls.length);
    fireEvent.press(button);
    const moved = probes.some((p, i) => p.mock.calls.length > before[i]);
    if (!moved) dead.push(name);
  }

  return dead;
}

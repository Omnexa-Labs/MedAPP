// The state of the medication list, derived in ONE place.
//
// ===========================================================================
// THIS FILE EXISTS TO MAKE A SPECIFIC FUTURE BUG IMPOSSIBLE
// ===========================================================================
// ActiveMedicationsScreen used to hold three independent pieces of state:
//
//     const medications = screenState === "empty" ? [] : ACTIVE_MEDICATIONS;
//     const isLoading   = screenState === "loading";
//     const hasError    = screenState === "error";      // a separate useState
//
// and render `EmptyMedications` from `ListEmptyComponent` whenever the list was
// empty and `isLoading` was false. `hasError` was reachable only from a URL
// parameter — no data path ever set it.
//
// The obvious one-line wiring — swap the constant for `useQuery(...).data ?? []`
// — would therefore have turned a 500 into
//
//     "No active medications. Ask your clinician to share a prescription."
//
// A backend outage rendered as a reassuring, actionable, WRONG statement about
// a patient's prescriptions, with the error branch unreachable. That is the
// single most dangerous defect available on this screen, and it would have
// looked like a correct commit.
//
// So the derivation moved here, ahead of any wiring, and it takes the QUERY
// OBJECT rather than pieces of it. There is no combination of arguments that
// yields `empty` from a failure: `isError` is tested before `data` is looked at,
// and a settled query with no data is an ERROR, not an empty list. The screen
// switches on `kind` and has no `data.length === 0` test of its own.
//
// ===========================================================================
// NOTHING CALLS THIS WITH A REAL QUERY YET, AND THAT IS NOT AN OVERSIGHT
// ===========================================================================
// There is no medication endpoint. The evidence is in the header of
// MedicationDetailsScreen.tsx and it is worth trusting: `ehr_service` has no
// medication or prescription table of any kind, and the two `/v1/prescriptions`
// implementations that do exist (pms_service, hms_service) are pharmacy and
// hospital systems — one is now reachable at `/v1/pms/*` but rejects a MedApp
// token outright, and both are gated on staff roles a patient does not hold.
//
// ActiveMedicationsScreen passes `{ kind: "sample" }`, which is its own branch
// and is labelled as such on screen. When a patient-scoped medication endpoint
// ships, the screen swaps that literal for `deriveMedicationsState(useQuery(…))`
// and the sample branch is deleted. Nothing else on the screen changes, because
// nothing else reads a list length.

import type { ActiveMedication } from "./types";

export type MedicationsState =
  | { kind: "loading" }
  /** A real failure. `offline` changes the words, never whether a list is shown. */
  | { kind: "error"; offline: boolean }
  /** The service answered, and this patient genuinely has no medications. */
  | { kind: "empty" }
  | { kind: "ready"; medications: readonly ActiveMedication[] }
  /** Local sample data, not this patient's record. See the header. */
  | { kind: "sample"; medications: readonly ActiveMedication[] };

/**
 * The shape this reads off a `UseQueryResult`. Declared structurally rather
 * than imported so the function can be called with a plain literal in a test —
 * the point of the exercise is that the mapping is checkable without a render.
 */
export interface MedicationsQueryLike {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  data: readonly ActiveMedication[] | undefined;
}

export function deriveMedicationsState(query: MedicationsQueryLike): MedicationsState {
  if (query.isPending) return { kind: "loading" };
  // BEFORE `data` is looked at. A failed query may still hold stale or absent
  // data, and neither of those is an empty medication list.
  if (query.isError) {
    const status = (query.error as { status?: number } | null)?.status;
    return { kind: "error", offline: status === 0 };
  }
  // Settled, not errored, and nothing came back. A failure, not an empty list.
  if (!query.data) return { kind: "error", offline: false };
  if (query.data.length === 0) return { kind: "empty" };
  return { kind: "ready", medications: query.data };
}

/** The medications a state carries, if any. `empty`/`loading`/`error` carry none. */
export function medicationsOf(state: MedicationsState): readonly ActiveMedication[] {
  return state.kind === "ready" || state.kind === "sample" ? state.medications : [];
}

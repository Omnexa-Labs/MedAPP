// Reference display helpers retained for regression tests. Production medication data comes from medication-api.ts.
// The tracker uses server-generated slots; it does not use the sample adherence calculation.

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

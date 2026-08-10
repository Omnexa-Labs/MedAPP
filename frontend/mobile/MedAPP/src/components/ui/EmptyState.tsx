// EmptyState — the ONE empty state (Figma 517:1773, variants
// Container=Card|Inline x Action=Yes|No).
//
// The frame's own rule: "An empty list and an empty search result are DIFFERENT
// MESSAGES but the SAME COMPONENT — change the copy and the Icon, never the
// anatomy." That is why `title`/`body`/`icon` are props and the layout is not.
// Every screen that hand-rolled this took the second option: FindCareScreen's
// copy branched the copy AND the glyph inside one component (fine) but also
// re-typed the plate, the ramp and the inset (not fine, and it landed on
// `fontSize: 18`, which the ramp has no step for).
//
// Action=Yes|No is the PRESENCE of `action`, not a boolean beside it. A boolean
// plus an optional handler is how you get a button that renders and does
// nothing; there is no combination of these props that draws an action with no
// onPress.
//
// An action here is NOT a retry — that is ErrorPanel's job, and ErrorPanel
// enforces a real refetch. An EmptyState's action goes somewhere or clears
// something ("Find a clinician", "Clear filters"), so a plain `onPress` is the
// honest type.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API
// here. This file uses none.

import { StatePanelShell, type StatePanelAction, type StatePanelContainer } from "./StatePanelShell";
import type { AnyIconName } from "./icons/Icon";

export type EmptyStateProps = {
  /** Defaults to `card` — the standalone case. Use `inline` INSIDE a card or
   *  section, so an empty section never draws a card inside a card. */
  container?: StatePanelContainer;
  title: string;
  /**
   * Optional, matching the frame's `showSupportingText`. Omit it only when the
   * title is already a complete sentence; a bare "No results" that does not say
   * what to do next is the state the copies were criticised for.
   */
  body?: string;
  /**
   * Defaults to the frame's `search-off`. Pass a clinical glyph (Health Icons)
   * or another chrome glyph when the section has one — LabResults uses
   * `lab-sample`, medications a pill.
   */
  icon?: AnyIconName;
  /**
   * The dead-end case (Action=No) is expressed by omitting this. Several screens
   * SHOULD omit it and their reasons are written down: ActiveMedicationsScreen's
   * "Add a medication" opened an Alert saying the feature did not exist, and
   * SelectTimeSlotScreen's "See calendar" opened nothing.
   */
  action?: Omit<StatePanelAction, "loading">;
  testID?: string;
  className?: string;
};

export function EmptyState({
  container = "card",
  title,
  body,
  icon = "search-off",
  action,
  testID,
  className,
}: EmptyStateProps) {
  return (
    <StatePanelShell
      container={container}
      tone="empty"
      icon={icon}
      title={title}
      body={body}
      action={
        action
          ? // The frames draw a trailing arrow on this action; a caller may
            // override it, but the default matches 517:1633 / 517:1752.
            { trailingIcon: "arrow-forward", ...action }
          : undefined
      }
      testID={testID}
      className={className}
    />
  );
}

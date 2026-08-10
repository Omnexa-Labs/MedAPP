// ErrorPanel — the ONE error state (Figma 517:2111, Container=Card|Inline).
//
// Three redundant signals, per the frame: the alert glyph, the title sentence
// and the action. Colour is never the only carrier (BRAND "Colour rules",
// WCAG 1.4.1), which is also why `body` is mandatory here and optional on
// EmptyState — an error must say what failed and what to do.
//
// ---------------------------------------------------------------------------
// WHY `retry` IS A PROMISE AND NOT A CALLBACK
// ---------------------------------------------------------------------------
// The frame says Retry has no boolean to switch it off, because "an error the
// user cannot act on is a dead end, not an error state". Taken literally that
// gives you a required `onRetry: () => void`, which is precisely the shape this
// app already shipped and had to unship: ActiveMedicationsScreen's header
// comment records that BOTH its "Try again" buttons "flipped a local enum.
// Nothing refetched", and roster2's set an outcome field. A required callback
// makes the BUTTON mandatory; it does nothing to make the REFETCH mandatory.
//
// So the two cases are split at the type level and neither one is `() => void`:
//
//   { retry }         `() => Promise<unknown>` — it must hand back the promise
//                     of the request it re-issues. `() => setState(x)` and
//                     `() => void query.refetch()` are both type errors, and
//                     the only easy way to satisfy it is to return the real
//                     `refetch()` / `mutateAsync()`. A __DEV__ assertion catches
//                     the cast that gets around the type.
//
//   { unrecoverable } a NAMED reason from a closed union. A 404, a 403 and a
//                     missing route param genuinely have nothing to retry —
//                     re-issuing the request returns the same status. Those
//                     screens must say which, in one greppable word, instead of
//                     drawing a "Try again" that re-fetches the same failure.
//
// Because the panel owns the promise it also owns the pending label, so
// "Retrying…" and the disabled state are derived from the request actually being
// in flight rather than from a flag a screen remembers to set.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API
// here. This file uses none.

import { useCallback, useEffect, useRef, useState } from "react";
import { StatePanelShell, type StatePanelAction, type StatePanelContainer } from "./StatePanelShell";
import type { AnyIconName } from "./icons/Icon";

/**
 * A retry handler MUST return the promise of the request it re-issues.
 *
 * `Promise<unknown>` and not `void | Promise<unknown>`: allowing `void` back
 * would readmit every no-op this type exists to reject.
 */
export type RetryHandler = () => Promise<unknown>;

/**
 * Why this failure has no retry. A closed union rather than a boolean, so
 * "this panel has no action" is always a stated reason and `grep unrecoverable`
 * lists every dead end in the app.
 */
export type UnrecoverableReason =
  /** No identifier to fetch with — a missing or malformed route param. */
  | "no-identifier"
  /** 404. The resource is not there; the same request returns the same 404. */
  | "not-found"
  /** 403. Retrying cannot grant permission. */
  | "forbidden"
  /**
   * One section of a page failed and the rest is live and correct. The retry is
   * deliberately withheld because a per-section spinner competing with valid
   * content is worse than the section saying so — see care/HospitalDetailScreen's
   * care-team panel, whose body ends "The rest of this page is up to date."
   */
  | "section-unavailable";

type Common = {
  /** Defaults to `card`. Use `inline` for a failure INSIDE a card or section. */
  container?: StatePanelContainer;
  title: string;
  /** Mandatory — no visibility toggle, per 517:2111. Say what failed and what
   *  to do. Pass the server's own message through here when there is one. */
  body: string;
  /** Defaults to the frame's alert glyph. */
  icon?: AnyIconName;
  testID?: string;
  className?: string;
};

export type ErrorPanelProps = Common &
  (
    | {
        retry: RetryHandler;
        /** Defaults to "Try again". */
        retryLabel?: string;
        /** Distinguishes two panels on one screen for assistive tech. */
        retryAccessibilityLabel?: string;
        /**
         * Optional extra "in flight" signal, OR-ed with the panel's own tracking
         * of the promise. Pass a query's `isFetching` when a refetch can also be
         * started from somewhere else on the screen (pull-to-refresh, say).
         */
        retrying?: boolean;
        unrecoverable?: never;
        action?: never;
      }
    | {
        unrecoverable: UnrecoverableReason;
        /**
         * A way OUT, never a way to re-run the failed request — "Back to patient
         * roster", "Browse all clinics". Typed as a plain onPress precisely
         * because it must not pretend to be a retry.
         */
        action?: Omit<StatePanelAction, "loading" | "trailingIcon">;
        retry?: never;
        retryLabel?: never;
        retryAccessibilityLabel?: never;
        retrying?: never;
      }
  );

export function ErrorPanel(props: ErrorPanelProps) {
  const {
    container = "card",
    title,
    body,
    icon = "error-outline",
    testID,
    className,
  } = props;

  const [inFlight, setInFlight] = useState(false);
  // A retry can resolve after the screen has navigated away (a 404 handler that
  // redirects, for instance), and settling state on an unmounted panel is a
  // console warning in every test that exercises it.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const retry = "retry" in props ? props.retry : undefined;
  const onRetryPress = useCallback(() => {
    if (!retry) return;
    const result = retry();
    if (
      __DEV__ &&
      (result === null ||
        typeof result !== "object" ||
        typeof (result as { then?: unknown }).then !== "function")
    ) {
      // The type already rejects `() => setState(x)`. This catches the cast that
      // gets past it, which is the form the shipped no-op retries actually took.
      throw new Error(
        "ErrorPanel: `retry` must return the promise of the request it re-issues " +
          "(e.g. `() => query.refetch()`). It returned something that is not a " +
          "promise, so this button cannot be refetching anything. If the failure " +
          "genuinely has nothing to retry, pass `unrecoverable` instead.",
      );
    }
    setInFlight(true);
    void Promise.resolve(result).finally(() => {
      if (mounted.current) setInFlight(false);
    });
  }, [retry]);

  let action: StatePanelAction | undefined;
  if (retry) {
    const busy = inFlight || Boolean(props.retrying);
    action = {
      // The label swap is derived from the promise, so it cannot claim to be
      // retrying while nothing is in flight, or stay silent while something is.
      label: busy ? "Retrying…" : (props.retryLabel ?? "Try again"),
      accessibilityLabel: props.retryAccessibilityLabel,
      onPress: onRetryPress,
      loading: busy,
      disabled: busy,
      // No trailing arrow on a retry — it does not go anywhere (Button 1:89).
    };
  } else if ("action" in props && props.action) {
    action = props.action;
  }

  return (
    <StatePanelShell
      container={container}
      tone="error"
      icon={icon}
      title={title}
      body={body}
      action={action}
      testID={testID}
      className={className}
    />
  );
}

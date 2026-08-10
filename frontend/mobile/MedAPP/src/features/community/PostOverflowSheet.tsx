// The post overflow menu — what the 3-dot on a post card and on the post detail
// screen open.
//
// ============================================================================
// IT USED TO OPEN NOTHING
// ============================================================================
// The 3-dot rendered with no `onPress` at all — the dead-control defect this
// codebase has been clearing out one screen at a time. Everything behind it now
// exists on the server: report, delete-own, bookmark, and the share text the
// share button already builds.
//
// ============================================================================
// A SHEET, NOT A SECOND AccountMenu
// ============================================================================
// `AccountMenu` is the only other menu in the tree and it was NOT reused. It is
// a corner popover anchored under the app bar with width arithmetic derived from
// `AppearanceSelector`'s intrinsic 298dp, and it hardcodes sign-out semantics. A
// row-level menu on a scrolling list has no such anchor — the 3-dot it belongs
// to can be anywhere on the screen — so it docks to the bottom edge, which is
// also where a thumb is. What IS reused is that file's structure and every rule
// it established: a `Modal` with `statusBarTranslucent` and `onRequestClose`, a
// `bg-scrim/40` dismiss backdrop, the deliberately-empty `onPress` that claims
// the responder on the panel itself (RN has no bubbling phase, so
// `stopPropagation` is a web reflex that also breaks `fireEvent.press`), BRAND's
// floating-surface shadow pair, and confirmation as a VIEW OF THIS MODAL rather
// than a second stacked one — stacked RN Modals on Android are unreliable.
//
// ============================================================================
// COLOUR: TOKENS ONLY, BOTH MODES
// ============================================================================
// Every surface, hairline and glyph here is a semantic token — `card-surface`,
// `outline-variant`, `on-surface`, `on-surface-variant`, `error`, `scrim`. No
// literal `white`/`black` and no frozen hex. The card this sheet is opened from
// shipped `color="#3d4947"` glyphs, which is the LIGHT value of
// `on-surface-variant` baked into JS; in dark mode that is a near-black glyph on
// a near-black surface. Icons take a colour STRING, so they resolve through
// `useTokenColor` rather than a class.
//
// ============================================================================
// ANONYMITY: THIS COMPONENT NEVER SEES AN AUTHOR ID
// ============================================================================
// Delete is shown only for the viewer's own post, which is an ownership question
// about a user id — and `author_user_id` is on the wire even for an ANONYMOUS
// post, so a component holding it could deanonymise its author with one stray
// `<Text>`. The comparison therefore happens at the data layer (`isOwnPost` in
// ./api) and only its boolean result crosses into the UI. `isOwn` below is that
// boolean. Delete-own works for an anonymous post because ownership travelled;
// the identity did not.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API
// here. This file uses none.

import { useContext, useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { Icon, type ChromeIconName } from "@/components/ui";
import { useTokenColor, useTokenShadow } from "@/lib/tokens";
import { REPORT_REASONS } from "./api";

/** docs/MOBILE_UX.md: 44 is the floor, 48 is "the target to beat". Rows take 56. */
const ROW_HEIGHT = 56;
const GLYPH = 22;
/** Clears the gesture bar when there is no inset to read (see the context note). */
const MIN_BOTTOM_PAD = 12;

type SheetView = "menu" | "report" | "reported" | "confirm-delete";

export interface PostOverflowSheetProps {
  visible: boolean;
  onClose: () => void;
  /**
   * Whether the signed-in user wrote this post. A BOOLEAN, never an id — see
   * the anonymity note in the header. Controls whether Delete is offered at
   * all; the server enforces the same rule with a 403.
   */
  isOwn: boolean;
  bookmarked: boolean;
  onToggleBookmark: () => void;
  onShare: () => void;
  /** Resolves TRUE when the report was accepted. The sheet then explains what happened. */
  onReport: (reason: string) => Promise<boolean>;
  /**
   * Called once the user has DISMISSED the "it's been reported" explanation.
   *
   * This is where the post is removed from the list, not in the mutation: a
   * removal on success unmounts this sheet mid-sentence, so the explanation for
   * the disappearance would be destroyed by the disappearance.
   */
  onReported: () => void;
  /** Resolves TRUE when the post was deleted. The sheet closes; the row is already gone. */
  onDelete: () => Promise<boolean>;
}

export function PostOverflowSheet({
  visible,
  onClose,
  isOwn,
  bookmarked,
  onToggleBookmark,
  onShare,
  onReport,
  onReported,
  onDelete,
}: PostOverflowSheetProps) {
  const [view, setView] = useState<SheetView>("menu");
  const [busy, setBusy] = useState(false);

  // `useContext`, NOT `useSafeAreaInsets()` — the latter THROWS ("No safe area
  // value available") without a provider, and this sheet is mounted by every
  // feed card. The same trap AccountMenu documents; a 0 fallback only costs a
  // few dp of bottom padding, which MIN_BOTTOM_PAD covers.
  const bottomInset = useContext(SafeAreaInsetsContext)?.bottom ?? 0;

  const onSurfaceVariant = useTokenColor("on-surface-variant");
  const error = useTokenColor("error");
  const onError = useTokenColor("on-error");
  const primary = useTokenColor("primary");
  const onPrimary = useTokenColor("on-primary");
  // BRAND's floating-surface pair for a sheet: 0 2px 6px at 8%, tinted with the
  // `shadow` token rather than grey.
  const shadow = useTokenShadow("shadow", { y: 2, blur: 6, opacity: 0.08 });

  // Reopening must never resume a half-finished report or a pending
  // confirmation — the same reset AccountMenu makes on close, made on OPEN as
  // well because this sheet stays mounted inside a list row.
  useEffect(() => {
    if (visible) {
      setView("menu");
      setBusy(false);
    }
  }, [visible]);

  const close = () => {
    const wasReported = view === "reported";
    setView("menu");
    onClose();
    // The row goes now, with the explanation already read. Last, because it
    // unmounts this component when the sheet lives inside a list card.
    if (wasReported) onReported();
  };

  /** Every action closes the sheet before doing its work — a menu that stays open reads as a failure. */
  const runAndClose = (action: () => void) => () => {
    close();
    action();
  };

  const submitReport = async (reason: string) => {
    setBusy(true);
    const ok = await onReport(reason);
    setBusy(false);
    // On failure the caller has already raised a visible error; drop back to
    // the menu rather than claiming a report that did not happen.
    setView(ok ? "reported" : "menu");
    if (!ok) close();
  };

  const submitDelete = async () => {
    setBusy(true);
    const ok = await onDelete();
    setBusy(false);
    close();
    void ok;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Android hardware back closes the sheet instead of leaving the screen.
      onRequestClose={close}
      // Without this the Android modal window starts below the status bar and
      // the scrim stops short of the top of the screen.
      statusBarTranslucent
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close post menu"
        className="flex-1 justify-end bg-scrim/40"
        onPress={close}
      >
        <Pressable
          accessibilityViewIsModal
          accessibilityRole="menu"
          testID="post-overflow-sheet"
          className="rounded-t-[28px] border-t border-outline-variant bg-card-surface px-md pt-sm"
          style={[{ paddingBottom: Math.max(bottomInset, MIN_BOTTOM_PAD) }, shadow]}
          // Claims the responder so a tap on the sheet is not a tap on the
          // dismiss backdrop. Empty on purpose — see the header.
          onPress={() => {}}
        >
          {/* Grabber. Decorative, and hidden from the a11y tree so it is not
              announced as an unnamed element above the first real row. */}
          <View
            className="mb-sm h-1 w-10 self-center rounded-full bg-outline-variant"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />

          {view === "menu" ? (
            <View>
              <SheetRow
                icon={bookmarked ? "bookmark" : "bookmark-border"}
                label={bookmarked ? "Remove from saved" : "Save post"}
                color={bookmarked ? primary : onSurfaceVariant}
                onPress={runAndClose(onToggleBookmark)}
              />
              {/* "Share post", not "Share": the card behind this sheet has a
                  Share button of its own, and two targets announcing the same
                  name is ambiguous to a screen reader even though only one of
                  them is reachable at a time. */}
              <SheetRow
                icon="share"
                label="Share post"
                color={onSurfaceVariant}
                onPress={runAndClose(onShare)}
              />
              <View className="h-px bg-outline-variant" />
              <SheetRow
                icon="flag"
                label="Report post"
                color={onSurfaceVariant}
                hint="Choose a reason on the next step"
                onPress={() => setView("report")}
              />
              {/* Delete is OMITTED for anyone but the author, not disabled. A
                  dimmed row would advertise a capability the server answers
                  with a 403, and on someone else's post that is not a
                  temporary state — it is never going to be allowed. */}
              {isOwn ? (
                <SheetRow
                  icon="delete-outline"
                  label="Delete post"
                  color={error}
                  textColor={error}
                  hint="Asks you to confirm first"
                  onPress={() => setView("confirm-delete")}
                />
              ) : null}
            </View>
          ) : view === "report" ? (
            <View>
              <SheetHeading title="Report this post" />
              {/* Stated UP FRONT, before the reasons, because it is the part a
                  reader cannot undo and cannot discover any other way: one
                  report flags the item outright — there is no threshold and no
                  un-flag route in the API. */}
              <Text className="px-3 pb-sm font-body-md text-body-md text-on-surface-variant">
                Reporting hides this post from the community feed straight away while a
                moderator reviews it. You won&apos;t see it here again.
              </Text>
              {REPORT_REASONS.map((reason) => (
                <SheetRow
                  key={reason}
                  icon="chevron-right"
                  iconTrailing
                  label={reason}
                  color={onSurfaceVariant}
                  disabled={busy}
                  onPress={() => void submitReport(reason)}
                />
              ))}
              {busy ? (
                <View className="items-center py-sm">
                  <ActivityIndicator color={primary} />
                </View>
              ) : null}
            </View>
          ) : view === "reported" ? (
            <View className="gap-sm pb-sm">
              <SheetHeading title="Thanks — it's been reported" />
              {/* The post vanishing from the feed with no explanation reads as a
                  bug. This is the explanation, and it is shown BEFORE the list
                  repaints without it. */}
              <Text className="px-3 font-body-md text-body-md text-on-surface-variant">
                This post is now hidden from the feed and a moderator will review it. That is
                why it has disappeared from your list.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Done"
                onPress={close}
                className="mx-3 items-center justify-center rounded-full px-4 py-3 active:opacity-[0.78]"
                style={{ backgroundColor: primary, minHeight: 48 }}
              >
                <Text className="font-label-md text-label-md" style={{ color: onPrimary }}>
                  Done
                </Text>
              </Pressable>
            </View>
          ) : (
            <View className="gap-sm pb-sm">
              <SheetHeading title="Delete this post?" />
              <Text className="px-3 font-body-md text-body-md text-on-surface-variant">
                This is permanent. The post and its comments are removed for everyone, and it
                cannot be restored.
              </Text>
              {/* Cancel FIRST and `outline`, destructive second and `error`-filled
                  — the order LeaveCallDialog and AccountMenu both use. The fill
                  is a plain OBJECT style, not a `style` callback: NativeWind's
                  Pressable wrapper resolves `className` into `style` and drops
                  the function form, which shipped an invisible confirm button
                  once already. */}
              <View className="gap-3 px-3">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Keep post"
                  onPress={() => setView("menu")}
                  disabled={busy}
                  className="w-full items-center justify-center rounded-full border border-outline px-4 py-3 active:opacity-70"
                  style={{ minHeight: 48 }}
                >
                  <Text className="font-label-md text-label-md text-on-surface">Keep post</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Delete post"
                  accessibilityState={{ disabled: busy, busy }}
                  onPress={() => void submitDelete()}
                  disabled={busy}
                  className="w-full items-center justify-center rounded-full px-4 py-3 active:opacity-[0.78]"
                  style={{ backgroundColor: error, minHeight: 48, opacity: busy ? 0.6 : 1 }}
                >
                  <Text className="font-label-md text-label-md" style={{ color: onError }}>
                    {busy ? "Deleting…" : "Delete"}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export interface CommentOverflowSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Ownership as a boolean, for the same reason as the post sheet. */
  isOwn: boolean;
  onReport: (reason: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}

/**
 * The same sheet for a COMMENT, and deliberately a separate component rather
 * than a `target: "post" | "comment"` prop on the one above.
 *
 * The two menus overlap on exactly one row (Report) and differ on everything
 * else: a comment has no bookmark, no share text of its own, and its report
 * copy is different because flagging a comment drops it from the list AND from
 * `comment_count` rather than removing a whole post from the feed. A shared
 * component with two of its four rows behind a flag would be one component
 * pretending to be one thing.
 *
 * Exactly ONE action is offered, by ownership: Delete on your own comment,
 * Report on someone else's. Reporting your own comment is allowed by the API,
 * but an author who wants their comment gone can delete it outright, so
 * offering both would be offering the worse of two options for the same intent.
 */
export function CommentOverflowSheet({
  visible,
  onClose,
  isOwn,
  onReport,
  onDelete,
}: CommentOverflowSheetProps) {
  const [view, setView] = useState<SheetView>("menu");
  const [busy, setBusy] = useState(false);
  const bottomInset = useContext(SafeAreaInsetsContext)?.bottom ?? 0;

  const onSurfaceVariant = useTokenColor("on-surface-variant");
  const error = useTokenColor("error");
  const onError = useTokenColor("on-error");
  const primary = useTokenColor("primary");
  const shadow = useTokenShadow("shadow", { y: 2, blur: 6, opacity: 0.08 });

  useEffect(() => {
    if (visible) {
      setView("menu");
      setBusy(false);
    }
  }, [visible]);

  const close = () => {
    setView("menu");
    onClose();
  };

  const run = async (action: () => Promise<boolean>) => {
    setBusy(true);
    await action();
    setBusy(false);
    close();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
      statusBarTranslucent
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close comment menu"
        className="flex-1 justify-end bg-scrim/40"
        onPress={close}
      >
        <Pressable
          accessibilityViewIsModal
          accessibilityRole="menu"
          testID="comment-overflow-sheet"
          className="rounded-t-[28px] border-t border-outline-variant bg-card-surface px-md pt-sm"
          style={[{ paddingBottom: Math.max(bottomInset, MIN_BOTTOM_PAD) }, shadow]}
          onPress={() => {}}
        >
          <View
            className="mb-sm h-1 w-10 self-center rounded-full bg-outline-variant"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />

          {view === "menu" ? (
            isOwn ? (
              <SheetRow
                icon="delete-outline"
                label="Delete comment"
                color={error}
                textColor={error}
                hint="Asks you to confirm first"
                onPress={() => setView("confirm-delete")}
              />
            ) : (
              <SheetRow
                icon="flag"
                label="Report comment"
                color={onSurfaceVariant}
                hint="Choose a reason on the next step"
                onPress={() => setView("report")}
              />
            )
          ) : view === "report" ? (
            <View>
              <SheetHeading title="Report this comment" />
              <Text className="px-3 pb-sm font-body-md text-body-md text-on-surface-variant">
                Reporting hides this comment straight away while a moderator reviews it.
              </Text>
              {REPORT_REASONS.map((reason) => (
                <SheetRow
                  key={reason}
                  icon="chevron-right"
                  iconTrailing
                  label={reason}
                  color={onSurfaceVariant}
                  disabled={busy}
                  onPress={() => void run(() => onReport(reason))}
                />
              ))}
              {busy ? (
                <View className="items-center py-sm">
                  <ActivityIndicator color={primary} />
                </View>
              ) : null}
            </View>
          ) : (
            <View className="gap-sm pb-sm">
              <SheetHeading title="Delete this comment?" />
              <Text className="px-3 font-body-md text-body-md text-on-surface-variant">
                This is permanent and cannot be undone.
              </Text>
              <View className="gap-3 px-3">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Keep comment"
                  onPress={() => setView("menu")}
                  disabled={busy}
                  className="w-full items-center justify-center rounded-full border border-outline px-4 py-3 active:opacity-70"
                  style={{ minHeight: 48 }}
                >
                  <Text className="font-label-md text-label-md text-on-surface">Keep comment</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Delete comment"
                  accessibilityState={{ disabled: busy, busy }}
                  onPress={() => void run(onDelete)}
                  disabled={busy}
                  className="w-full items-center justify-center rounded-full px-4 py-3 active:opacity-[0.78]"
                  style={{ backgroundColor: error, minHeight: 48, opacity: busy ? 0.6 : 1 }}
                >
                  <Text className="font-label-md text-label-md" style={{ color: onError }}>
                    {busy ? "Deleting…" : "Delete"}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SheetHeading({ title }: { title: string }) {
  return (
    <Text
      accessibilityRole="header"
      className="px-3 pb-xs pt-sm font-headline-md text-headline-md text-on-surface"
    >
      {title}
    </Text>
  );
}

function SheetRow({
  icon,
  label,
  color,
  textColor,
  hint,
  disabled,
  iconTrailing,
  onPress,
}: {
  icon: ChromeIconName;
  label: string;
  color: string;
  /** Only the destructive row tints its words; every other row is `on-surface`. */
  textColor?: string;
  hint?: string;
  disabled?: boolean;
  iconTrailing?: boolean;
  onPress: () => void;
}) {
  const glyph = <Icon chrome={icon} size={GLYPH} color={color} />;
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-md px-3 active:opacity-70"
      style={{ minHeight: ROW_HEIGHT, opacity: disabled ? 0.5 : 1 }}
    >
      {iconTrailing ? null : glyph}
      <Text
        className={`flex-1 font-body-md text-body-md ${textColor ? "" : "text-on-surface"}`}
        style={textColor ? { color: textColor } : undefined}
      >
        {label}
      </Text>
      {iconTrailing ? glyph : null}
    </Pressable>
  );
}

// Partner Onboarding Status — "onboarding_status"
// (Figma file kRifcg1KCEAlTXy4aimotK, page "Onboarding & Auth", node 72:117).
//
// The post-application holding screen for a partner whose clinic application is
// under review — i.e. `user.partner.status === "pending"` (see src/types/user.ts).
// features/partner/README.md owns this surface: "Partner-status display
// (pending / approved / rejected) once the user has applied". The KYC/licence
// upload itself stays on the web; this screen only reports state and nudges
// profile completion.
//
// ===========================================================================
// THIS REBUILD (frame 72:117 moved ahead of the code)
//
// The frame gained an approved practitioner shell and a real hero illustration,
// and it fixed three things the previous build had flagged. What changed here:
//
//  - AppBar. The frame now instances the component set "Practitioner AppBar
//    (Back + Logo + Bell)" 379:491 (as 385:741): back button, CENTRED logo, bell
//    with unread badge. The previous build had a bespoke logo-left/avatar-right
//    bar and no bell. Rebuilt as the shared <PractitionerShell /> —
//    src/components/shell/ — because the same bar is specified for every
//    practitioner screen.
//  - BottomNav. The frame now instances "Practitioner BottomNav" 381:628 with
//    Active=Home. The previous build DELETED its tab bar on the belief that the
//    frame's bar was unapproved and that a second bar would redefine the patient
//    shell. Both halves of that are now settled: there IS an approved
//    practitioner set (Home/Appointments/Inbox/Patients/Profile), it is a
//    separate component set from the patient one, and it lives in
//    components/shell/ so the patient bar in features/home/components/ is
//    untouched. The explanatory comment that stood where the bar used to be is
//    replaced by the real shell.
//  - Hero art. Node 386:490 "Hero Art / Clinic Verification" is now a real
//    composition, not the old "Illustration Placeholder — NO ASSET" node: a
//    primary-tint panel holding a 132px radius-full `surface` disc with the
//    Health Icons ambulatory_clinic glyph at 80px on `color/primary`, plus an
//    icon/secure + label-sm caption on `on-surface-variant`. The previous build
//    rendered a 72px glyph in `on-surface-variant` with no disc — the reported
//    "grey glyph, no disc".
//  - Step markers (390:490/492/494). Now: done = `primary` fill + check;
//    active = `primary-container` fill + clock; todo = NO fill, a 2px
//    `outline-variant` ring + a small `on-surface-variant` dot. The previous
//    build filled the todo node solid `outline-variant` and drew no glyph in it.
//  - Bound radii. Cards are `radius/24`, the hero-art panel is `radius/24`, the
//    task icon tiles are `radius/12`, pills are `radius/full`. All come from the
//    <Card> primitive or a named constant below, none are inlined literals.
//
// Resolved by the frame, so the previous build's flags 3, 4, 5, 7 and 11 are
// GONE and their workarounds are deleted:
//   - flag 3 (13px / 11px off-ramp type): the frame is now 24 / 20 / 16 / 12
//     throughout, i.e. exactly BRAND's ramp. `DENSE_SECONDARY` is deleted; the
//     dense rows are plain `label-sm`.
//   - flag 4 (off-scale spacing): every value is now 4 / 8 / 12 / 16 / 24.
//   - flag 5 (24px body gutter vs 16px bar inset): Content is now px 16, so body
//     and app bar share the BRAND gutter.
//   - flag 7 (placeholder illustration): real art, see above.
//   - flag 11 (card fill substitution): the frame now binds cards to a
//     `card-surface` ROLE, which is the token the shared <Card> resolves.
//
// Translation calls (Figma reference code -> this project):
//   - Cards: the shared <Card> primitive. Its treatment (bg `card-surface`,
//     `outline-variant` hairline, `rounded-card`, and NO drop shadow per
//     docs/BRAND.md) is the whole card spec, so the local
//     `CARD_SHADOW_SPEC` + `useTokenShadow` + `flat` +
//     `bg-surface-container-lowest` of the previous build are all DELETED. Only
//     the inset differs (frame 16 vs the primitive's `p-md` 24) and that is
//     passed through `style`, not a second `p-*` class — src/lib/cn.ts has no
//     tailwind-merge, so two conflicting utilities in one call is undefined.
//   - Every glyph goes through the shared <Icon />; no emoji anywhere
//     (docs/BRAND.md: "No emojis, ever").
//   - Logo (PNG) -> <Logo variant="auto" />, inside PractitionerAppBar.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* APIs
// here. None beyond expo-router (via the shell) are used.
//
// ===========================================================================
// FLAGGED — read before "fixing" any of these
//
// 1. THE AVATAR IS GONE. The previous bar rendered <AvatarWithFallback /> on the
//    right (the reported "bare teal letter A" — it had no circle because it was
//    being handed a single initial with no tone). The approved practitioner
//    AppBar 379:491 has back + logo + bell and no avatar at all, so the element
//    is dropped, not restyled. This is a real deletion from the shipped screen:
//    the practitioner now has no visible affordance to their own profile from
//    this bar (only the Profile tab, which has no route — see flag 3).
//    docs/BRAND.md §App shell still says "avatar + notifications grouped on the
//    right"; that describes the patient bar and needs a practitioner carve-out.
// 2. Bell has no data and no destination. The frame hardcodes an unread count of
//    "3". Nothing in the app models notification counts and there is no
//    notifications route, so no value is passed and the badge does not render.
//    A mock display NAME is harmless; a mock unread count tells the user
//    something false. The badge treatment is implemented in
//    PractitionerAppBar and covered by tests — wire `unreadCount` /
//    `onNotificationsPress` when a notifications store lands.
// 3. Three of the five tabs have no route. src/app/(app)/ has no practitioner
//    home, no patients roster and no practitioner self-profile
//    (practitioner-social-profile is the PATIENT-facing view of a specialist).
//    Those tabs render — the shell is fixed app-wide — but no-op and announce
//    "Not available yet". Appointments and Inbox push the real
//    /(app)/appointments and /(app)/inbox; AppointmentManagementScreen is
//    currently authored patient-side and needs a practitioner variant. Full
//    table in src/components/shell/PractitionerBottomNav.tsx.
// 4. Back button + bottom nav together contradict docs/BRAND.md ("Detail
//    screens don't get the bottom nav — they get a back button instead"). The
//    AppBar's Figma description says back is "always available", so the pairing
//    is deliberate in the design system. Followed the frame.
//    Consequence: this screen's expected entry is the web onboarding hand-back
//    deep link, where there is no history to pop AND no practitioner home to
//    fall back to, so the back button hides itself. It becomes "always
//    available" only once a practitioner home route exists.
// 5. Card elevation: RESOLVED, and the resolution is "no shadow". The frame's
//    `elevation/card` used to carry two drop shadows tinted with `color/primary`
//    (0 8 24 @ 10% key + 0 2 6 @ 6% contact) and this screen's earlier build had
//    a local one-layer approximation. docs/BRAND.md now binds cards to NO drop
//    shadow — separation is surface tone plus the `outline-variant` hairline —
//    so <Card> emits none and nothing is re-implemented here. Remaining action
//    is on the DESIGN side, not in code: the `elevation/card` effect style in
//    Figma must be emptied so the frame stops specifying a shadow the app will
//    never draw.
// 6. Contrast: unchanged from the previous build and now CONFIRMED by the frame.
//    `*-container` fills carry `on-primary-container` text/glyphs, which is what
//    72:117 binds (previously the frame said `on-primary`, which is illegible on
//    `primary-container` in dark mode). The stepper's done node is `bg-primary`
//    and therefore resolves `on-primary` — a per-fill decision, not per-row.
// 7. Task-card destinations still don't exist. Add Clinic Photos / Set Operating
//    Hours / List Services Offered have no screens or web endpoints spec'd, so
//    they stay accessible no-op stubs. The "0/3 Completed" counter is derived
//    from the task list, so it stays honest once real completion state is wired.
// 8. States the frame does not draw. The frame only shows `pending`. Because
//    this screen is driven by `partner.status`, `approved` and `rejected` also
//    render — and `rejected` must not reuse the frame's tonal-teal pill, or
//    colour would signal "fine" under copy that says otherwise. It uses
//    `error-container` / `on-error-container`. Needs a designed frame.
// 9. Icon-set gaps (unchanged, and the frame now names them as chrome). "Add
//    Clinic Photos" and "Set Operating Hours" are `icon/chrome-camera` /
//    `icon/chrome-clock` in Figma; Health Icons ships no camera and no clock, so
//    they use the MaterialIcons fallback BRAND prescribes for chrome. The step
//    markers' check / clock / dot are chrome for the same reason.
// ===========================================================================

import { Pressable, ScrollView, Text, View } from "react-native";
import { PractitionerShell } from "@/components/shell";
import { Card, Icon } from "@/components/ui";
import type { ChromeIconName, HealthIconName } from "@/components/ui";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTokenColor } from "@/lib/tokens";
import type { PartnerStatus } from "@/types/user";

// ---------------------------------------------------------------------------
// Geometry from the frame. Named so the numbers are reviewable against Figma
// instead of being sprinkled through JSX. Colours are never in here — those go
// through tokens (Tailwind classes, or useTokenColor for an Icon `color` prop).
// ---------------------------------------------------------------------------

/** Frame's card inset (16). <Card>'s own default is `p-md` (24). */
const CARD_PADDING = 16;
/** Vertical rhythm inside every card, and between the profile-task rows. */
const CARD_GAP = 16;
/** Content node 72:119: px 16 (BRAND gutter), py 24, 24 between sections. */
const GUTTER = 16;
const SECTION_GAP = 24;
/** Hero Art 386:490: p 24, gap 16. Disc 386:491: 132, radius/full. Glyph 80. */
const HERO_ART_PADDING = 24;
const HERO_DISC = 132;
const HERO_GLYPH = 80;
const CAPTION_GLYPH = 20;
/** Step Marker 390:490: 38 x 38, radius/full. Glyph 20. Text starts at x=54. */
const STEP_NODE = 38;
const STEP_GAP = 16; // 38 + 16 = 54
const STEP_GLYPH = 20;
/** Frame tops 0 / 66 / 160 against heights 42 / 70 / 42 -> 24 between rows. */
const STEP_ROW_GAP = 24;
/** Task Card Icon Tile 72:164: 48 x 48, radius/12; glyph 24. */
const TILE = 48;
const TILE_GLYPH = 24;
const CHEVRON = 24;

/**
 * Leading, from the frame's line-height multipliers. The families and sizes come
 * from the Tailwind type tokens (`font-*` + `text-*`); only leading is set here,
 * because the tokens' multipliers (1.6 for body-md, 1 for label-sm) predate
 * these frames and changing them would move every screen.
 */
const LEADING = {
  /** headline-lg 24 x 1.3 */
  headlineLg: 31,
  /** headline-md 20 x 1.3 */
  headlineMd: 26,
  /** body-md 16 x 1.4 */
  bodyMd: 22,
  /** label-sm 12 x 1.3 */
  labelSm: 16,
} as const;

// ---------------------------------------------------------------------------
// Verification stepper model
//
// Derived from `partner.status` rather than pinned to the frame's mock, so the
// approved/rejected states render instead of needing a separate screen.
// ---------------------------------------------------------------------------

type StepState = "done" | "active" | "todo";

interface Step {
  key: string;
  title: string;
  detail: string;
  /** Small pill under the row, e.g. the frame's "ETA: 1-2 business days". */
  eta?: string;
}

function stepsFor(status: PartnerStatus, submittedOn: string): Step[] {
  return [
    {
      key: "received",
      title: "Application Received",
      detail: `Submitted ${submittedOn}`,
    },
    {
      key: "review",
      title: "Document Review",
      detail: "Verifying credentials & licensing",
      eta: status === "pending" ? "ETA: 1-2 business days" : undefined,
    },
    {
      key: "activation",
      title: "Account Activation",
      detail: "Final approval & onboarding",
    },
  ];
}

/** Index of the step currently in progress; everything before it is done. */
function activeIndexFor(status: PartnerStatus): number {
  switch (status) {
    case "approved":
      return 3; // all three complete
    case "pending":
      return 1; // Document Review
    default:
      return 1;
  }
}

function stateFor(index: number, activeIndex: number): StepState {
  if (index < activeIndex) return "done";
  if (index === activeIndex) return "active";
  return "todo";
}

// ---------------------------------------------------------------------------
// Profile-completion tasks (frame: "Optimize Your Profile")
// ---------------------------------------------------------------------------

interface Task {
  key: string;
  title: string;
  detail: string;
  /** Health Icons name when the concept is clinical/domain. */
  icon?: HealthIconName;
  /** MaterialIcons fallback where Health Icons has no glyph (see flag 9). */
  chrome?: ChromeIconName;
  done?: boolean;
}

const TASKS: Task[] = [
  {
    key: "photos",
    title: "Add Clinic Photos",
    detail: "Upload photos to help patients recognize your clinic.",
    chrome: "photo-camera",
  },
  {
    key: "hours",
    title: "Set Operating Hours",
    detail: "Let patients know when you are available.",
    chrome: "schedule",
  },
  {
    key: "services",
    title: "List Services Offered",
    detail: "Add the services you provide for better matching.",
    icon: "stethoscope",
  },
];

// ---------------------------------------------------------------------------
const STATUS_LABEL: Record<PartnerStatus, string> = {
  none: "Application Submitted",
  pending: "Application Submitted",
  approved: "Application Approved",
  rejected: "Action Needed",
};

const STATUS_BODY: Record<PartnerStatus, string> = {
  none: "Our team is reviewing your clinic application. We'll notify you as soon as verification is complete — typically within 2-3 business days.",
  pending:
    "Our team is reviewing your clinic application. We'll notify you as soon as verification is complete — typically within 2-3 business days.",
  approved: "Your clinic is verified. Finish your profile so patients can find and book you.",
  rejected:
    "We couldn't verify your clinic with the documents provided. Check your email for what to resend.",
};

/** Hero-art caption (386:501) — reassurance, not status. */
const HERO_CAPTION = "Secure credential review in progress";

function formatSubmitted(iso?: string): string {
  if (!iso) return "Jul 24, 2026"; // frame's mock value, for design review
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Jul 24, 2026";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function OnboardingStatusScreen() {
  const user = useCurrentUser();

  const status: PartnerStatus = user?.partner?.status ?? "pending";
  // Figma's "Dr. Adjei" is mock content; the real display name wins when the
  // session has one.
  const name = user?.displayName?.trim() || "Dr. Adjei";
  const steps = stepsFor(status, formatSubmitted(user?.partner?.appliedAt));
  const activeIndex = activeIndexFor(status);

  const completed = TASKS.filter((t) => t.done).length;

  return (
    // The shell renders the practitioner AppBar (379:491) and BottomNav
    // (381:628). `activeTab="home"` matches the frame's Active=Home instance.
    // No `unreadCount` / `onNotificationsPress` — see flag 2.
    // `backFallbackHref` matters here specifically: PractitionerAppBar hides
    // back when there is no history to pop, and this screen's normal entry is a
    // deep link from the partner web hand-back — which leaves no history. Without
    // a fallback the practitioner lands with no way out, and the product owner
    // asked for back to work across the whole practitioner shell.
    <PractitionerShell
      activeTab="home"
      backFallbackHref="/(app)"
      testID="onboarding-status"
    >
      {/* Content (72:119) — px 16, py 24, 24 between sections. */}
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: GUTTER,
          paddingVertical: SECTION_GAP,
          gap: SECTION_GAP,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* ---- Hero card (72:130) ---- */}
        <Card className="w-full" style={{ padding: CARD_PADDING, gap: CARD_GAP }}>
          <StatusPill
            label={STATUS_LABEL[status]}
            tone={status === "rejected" ? "error" : "accent"}
          />
          <Text
            className="w-full font-headline-lg-mobile text-headline-lg-mobile text-on-surface"
            style={{ lineHeight: LEADING.headlineLg }}
          >
            {status === "approved" ? `You're verified, ${name}` : `You're on your way, ${name}`}
          </Text>
          <Text
            className="w-full font-body-md text-body-md text-on-surface-variant"
            style={{ lineHeight: LEADING.bodyMd }}
          >
            {STATUS_BODY[status]}
          </Text>

          <HeroArt />
        </Card>

        {/* ---- Verification Status card (72:137) ---- */}
        <Card className="w-full" style={{ padding: CARD_PADDING, gap: CARD_GAP }}>
          <Text
            className="font-headline-md text-headline-md text-on-surface"
            style={{ lineHeight: LEADING.headlineMd }}
          >
            Verification Status
          </Text>

          {/* VerticalStepper (72:139). Figma positions every child absolutely;
              rebuilt as a flex column (24px between rows, which is what the
              frame's 0/66/160 tops work out to) so long labels wrap instead of
              clipping. The connector (72:157) is the one absolute element — it
              has to run behind the markers. */}
          <View className="w-full">
            <View
              className="absolute bg-outline-variant"
              style={{
                left: STEP_NODE / 2 - 1, // 18, matching the frame
                top: STEP_NODE / 2,
                bottom: STEP_NODE / 2,
                width: 2,
              }}
            />
            <View style={{ gap: STEP_ROW_GAP }}>
              {steps.map((step, i) => (
                <StepRow key={step.key} step={step} state={stateFor(i, activeIndex)} />
              ))}
            </View>
          </View>
        </Card>

        {/* ---- Optimize Your Profile (72:158) ---- */}
        <View className="w-full" style={{ gap: CARD_GAP }}>
          <View className="w-full flex-row items-center justify-between">
            <Text
              className="font-headline-md text-headline-md text-on-surface"
              style={{ lineHeight: LEADING.headlineMd }}
            >
              Optimize Your Profile
            </Text>
            {/* Badge / 0/3 Completed (72:161) — surface-container-high fill with
                on-surface-variant text, px 12 / py 4. */}
            <View className="self-start rounded-full bg-surface-container-high px-3 py-1">
              <Text
                className="font-label-sm text-label-sm text-on-surface-variant"
                style={{ lineHeight: LEADING.labelSm }}
              >
                {completed}/{TASKS.length} Completed
              </Text>
            </View>
          </View>

          {TASKS.map((task) => (
            <TaskCard key={task.key} task={task} />
          ))}
        </View>
      </ScrollView>
    </PractitionerShell>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/**
 * Hero Art / Clinic Verification (386:490) — the real illustration that replaced
 * the old "Illustration Placeholder — NO ASSET" node.
 *
 * A `primary-tint` panel at `radius/24` holding a 132px `radius/full` `surface`
 * disc, the ambulatory_clinic glyph at 80px on `color/primary`, and a caption
 * row (icon/secure 20px + label-sm) on `on-surface-variant`.
 *
 * Both glyphs are decorative: the card's heading, body and this caption already
 * carry every piece of meaning, so they are hidden from assistive tech rather
 * than read out as a third description of the same thing.
 */
function HeroArt() {
  const primary = useTokenColor("primary");
  const onSurfaceVariant = useTokenColor("on-surface-variant");

  return (
    <View
      className="w-full items-center justify-center rounded-card bg-primary-tint"
      style={{ padding: HERO_ART_PADDING, gap: CARD_GAP }}
    >
      <View
        className="items-center justify-center overflow-hidden rounded-full bg-surface"
        style={{ width: HERO_DISC, height: HERO_DISC }}
      >
        <Icon name="clinic" size={HERO_GLYPH} color={primary} />
      </View>
      <View className="flex-row items-center" style={{ gap: 8 }}>
        <Icon name="secure" size={CAPTION_GLYPH} color={onSurfaceVariant} />
        <Text
          className="text-center font-label-sm text-label-sm text-on-surface-variant"
          style={{ lineHeight: LEADING.labelSm }}
        >
          {HERO_CAPTION}
        </Text>
      </View>
    </View>
  );
}

/**
 * Frame 72:131 — a solid tonal-teal pill, px 12 / py 4, with a label-sm
 * sentence-case label on `on-primary-container`.
 *
 * NOT the shared `Badge` primitive: `Badge` renders a 10px UPPERCASE label on a
 * 10%-alpha tint, which is a visibly different component and also below BRAND's
 * 12sp floor. Kept local (one screen) rather than adding a one-off tone to the
 * shared primitive; promote if a second screen needs it.
 *
 * `tone="error"` exists for the `rejected` status only (flag 8) — a problem state
 * must not reuse the success path's tonal teal, or colour is signalling "fine"
 * while the copy says otherwise.
 */
function StatusPill({ label, tone = "accent" }: { label: string; tone?: "accent" | "error" }) {
  const surface = tone === "error" ? "bg-error-container" : "bg-primary-container";
  const onSurface = tone === "error" ? "text-on-error-container" : "text-on-primary-container";
  return (
    <View className={`self-start rounded-full px-3 py-1 ${surface}`}>
      <Text
        className={`font-label-sm text-label-sm ${onSurface}`}
        style={{ lineHeight: LEADING.labelSm }}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * Step Marker + Text (390:490-495).
 *
 * The three marker states, as the frame now draws them:
 *   done    `primary` fill        + chrome check, on `on-primary`
 *   active  `primary-container`   + chrome clock, on `on-primary-container`
 *   todo    NO fill, 2px `outline-variant` ring + a small `on-surface-variant`
 *           dot (icon/chrome-pending 444:882)
 *
 * The glyph colour is resolved PER FILL, not once per row: a `bg-primary` disc
 * needs `on-primary`, a `bg-primary-container` disc needs `on-primary-container`.
 * Sharing one value breaks dark mode, where `primary` is light and so is
 * `on-primary-container` — a ~1.1:1 check mark.
 *
 * Colour never carries the meaning alone: each state has a distinct glyph and
 * each row its own text (docs/BRAND.md §Colour rules).
 */
function StepRow({ step, state }: { step: Step; state: StepState }) {
  const onPrimary = useTokenColor("on-primary");
  const onPrimaryContainer = useTokenColor("on-primary-container");
  const onSurfaceVariant = useTokenColor("on-surface-variant");

  const markerClass =
    state === "done"
      ? "bg-primary"
      : state === "active"
        ? "bg-primary-container"
        : "border-2 border-outline-variant";

  return (
    <View className="w-full flex-row items-start" style={{ gap: STEP_GAP }}>
      <View
        className={`items-center justify-center overflow-hidden rounded-full ${markerClass}`}
        style={{ width: STEP_NODE, height: STEP_NODE }}
      >
        {state === "done" ? (
          <Icon chrome="check" size={STEP_GLYPH} color={onPrimary} label="Complete" />
        ) : state === "active" ? (
          <Icon
            chrome="schedule"
            size={STEP_GLYPH}
            color={onPrimaryContainer}
            label="In progress"
          />
        ) : (
          <Icon
            chrome="fiber-manual-record"
            size={STEP_GLYPH}
            color={onSurfaceVariant}
            label="Not started"
          />
        )}
      </View>
      <View className="flex-1" style={{ gap: 4 }}>
        <Text
          className="font-body-md text-body-md text-on-surface"
          style={{ lineHeight: LEADING.bodyMd }}
        >
          {step.title}
        </Text>
        <Text
          className="font-label-sm text-label-sm text-on-surface-variant"
          style={{ lineHeight: LEADING.labelSm }}
        >
          {step.detail}
        </Text>
        {step.eta ? (
          // ETA Chip (72:150) — px 12 / py 4, radius/full, primary-container.
          <View className="self-start rounded-full bg-primary-container px-3 py-1">
            <Text
              className="font-label-sm text-label-sm text-on-primary-container"
              style={{ lineHeight: LEADING.labelSm }}
            >
              {step.eta}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Task Card (72:163 / 72:170 / 72:177) — a 90px row: 48px `radius/12`
 * `primary-container` icon tile, title + detail, trailing chevron.
 *
 * The whole row is the touch target (>= 44pt in both axes). No destination
 * exists for any of the three tasks yet (flag 7), so press is a no-op — but the
 * accessible label/hint are real so the row isn't a silent dead end.
 */
function TaskCard({ task }: { task: Task }) {
  const onPrimaryContainer = useTokenColor("on-primary-container");
  const onSurfaceVariant = useTokenColor("on-surface-variant");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${task.title}. ${task.detail}`}
      accessibilityHint="Not available yet"
      onPress={() => {}}
      className="w-full active:opacity-80"
    >
      <Card
        className="w-full flex-row items-center"
        style={{ padding: CARD_PADDING, gap: CARD_GAP }}
      >
        <View
          className="items-center justify-center overflow-hidden rounded-md bg-primary-container"
          style={{ width: TILE, height: TILE }}
        >
          {task.icon ? (
            <Icon name={task.icon} size={TILE_GLYPH} color={onPrimaryContainer} />
          ) : (
            <Icon chrome={task.chrome!} size={TILE_GLYPH} color={onPrimaryContainer} />
          )}
        </View>
        <View className="flex-1" style={{ gap: 4 }}>
          <Text
            className="font-body-md text-body-md text-on-surface"
            style={{ lineHeight: LEADING.bodyMd }}
          >
            {task.title}
          </Text>
          <Text
            className="font-label-sm text-label-sm text-on-surface-variant"
            style={{ lineHeight: LEADING.labelSm }}
          >
            {task.detail}
          </Text>
        </View>
        <Icon chrome="chevron-right" size={CHEVRON} color={onSurfaceVariant} />
      </Card>
    </Pressable>
  );
}

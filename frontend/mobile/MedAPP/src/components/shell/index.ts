// Barrel for the app-shell chrome. Import from "@/components/shell".
//
// There are THREE shells in this product and they are NOT interchangeable:
//
//   patient        PatientAppBar + PatientShell (this directory, Figma sets
//                  741:887 `Back=Hidden|Shown` + 740:1015 `Active=Home|…`)
//                  over the patient bottom nav in
//                  src/features/home/components/BottomNav.tsx
//                  Home / Overview / Inbox / Community / Lifestyle
//   practitioner   this directory (Figma 656:850 + 381:628)
//                  Home / Schedule / Inbox / Patients / Profile
//   detail         DetailAppBar + DetailShell (Figma 193:120). Audience-neutral
//                  and tab-less: a pushed screen, never a tab root.
//
// Never render a patient tab set on a practitioner screen or vice versa, and
// never a tab set at all on a detail screen.
// The bar for DETAIL screens (not tab roots) — Figma 193:120. Audience-neutral:
// it carries no logo and no tab set, so unlike the two bars below it is shared by
// patient and practitioner detail screens alike.
export {
  DetailAppBar,
  DETAIL_APP_BAR_HEIGHT,
  DETAIL_APP_BAR_LEADING_SIZE,
  type DetailAppBarProps,
} from "./DetailAppBar";
// The wrapper a detail screen actually reaches for: safe area + DetailAppBar +
// body, with no bottom nav and no way to ask for one.
export { DetailShell, DETAIL_SHELL_EDGES } from "./DetailShell";
export { PatientAppBar, PATIENT_APP_BAR_HEIGHT } from "./PatientAppBar";
// Profile, Appearance, Sign out — for BOTH audiences now, from one file.
//
// Patient: `PatientShell` mounts it by default behind the app bar's avatar, so a
// patient screen never names it. Reaching for it directly from a patient screen
// re-creates the per-screen-chrome problem the shell exists to end.
//
// Practitioner: mounted by `PractitionerProfileScreen`, because the PO ruled the
// account menu lives there and the practitioner app bar has no avatar to hang it
// off. It is parameterised (`profileHref`, `anchorTop`, `initialView`), NOT
// duplicated — a second copy would be a second sign-out flow to keep in step
// with the confirmation rules this component exists to enforce.
export {
  AccountMenu,
  accountMenuWidth,
  ACCOUNT_MENU_PROFILE_HREF,
  SIGN_OUT_HREF,
  type AccountMenuProps,
  type MenuView,
} from "./AccountMenu";
// PATIENT_TAB_HREFS is the single source of truth for where the five patient
// tabs go. Exported so a test (or a future `<Tabs>` layout) can assert against
// the map rather than re-typing the route strings.
export { PatientShell, PATIENT_TAB_HREFS, SETTINGS_HREF, NOTIFICATIONS_HREF } from "./PatientShell";
export { PractitionerAppBar, PRACTITIONER_APP_BAR_HEIGHT } from "./PractitionerAppBar";
// PRACTITIONER_TAB_HREFS is the practitioner counterpart of PATIENT_TAB_HREFS:
// the single source of truth for where the five practitioner tabs go, exported
// so a test asserts against the map rather than re-typing the route strings.
export {
  PractitionerBottomNav,
  PRACTITIONER_TAB_HREFS,
  type PractitionerTab,
} from "./PractitionerBottomNav";
export { PractitionerShell } from "./PractitionerShell";
// Re-exported so a patient screen can type its `activeTab` without reaching into
// the features tree. The bar itself stays in features/home for now — 12 screens
// import it from there and moving it is a separate, mechanical change.
export { type PatientTab } from "@/features/home/components/BottomNav";

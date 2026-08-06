# Pipeline contract

Two agents work on MedApp at the same time. This file is how they stay out of each other's
way. It is a **contract, not a guide** — if you are an agent working on this project, read it
before you touch anything, and read `docs/BRAND.md` (binding) and `docs/MOBILE_UX.md`
(subordinate) alongside it.

Last verified against the live Figma file: **2026-07-31**. Node ids below were read from the
file, not remembered — but re-verify before relying on one, because the file changes hourly.

Figma file: `kRifcg1KCEAlTXy4aimotK`
App root: `frontend/mobile/MedAPP`

---

## 1. Who owns what

The rule that matters: **never edit the same surface for the same screen at the same time.**
Two non-deterministic agents cannot negotiate; they can only stay apart.

| Surface | Owner | Notes |
|---|---|---|
| Figma — screen frames | **Codex**, **Claude while Codex is offline** | Codex is out until 8 August (usage limit), so Claude holds every Figma claim. Hand back by re-reading §5 from 2026-08-02 onward — the file has moved a long way. |
| Figma — Design System page | whoever holds no competing claim | Whoever adds a component owns it. Announce it (§5). **Never edit it while another agent has an open flow claim** — instances get reshaped mid-draw (§5c). |
| React Native codebase | **Claude** | Builds and reconciles code against frames that already exist. |
| `docs/BRAND.md`, `docs/MOBILE_UX.md`, this file | **Claude** | Binding on both agents. Propose changes rather than editing unilaterally. |
| Review gates | **Claude** | Verifies both sides against BRAND. A gate failing your work is the system functioning. |

If you need to cross the line — a code fix that requires a Figma change, or vice versa — write
it into §5 as a handoff instead of doing it yourself.

---

## 2. The single most important rule

**Figma is the source of truth for appearance. The design system is the source of truth for
Figma.**

A frame that hand-draws something the design system already has is a **regression**, even if it
looks right. It re-creates the exact drift that cost this project days: 24 screens each with
their own app bar, ten private chip implementations, five hand-rolled search fields, 88 invented
card shadows.

So, before drawing anything:

1. Read the **Design System** page (`26:84`) and/or call `search_design_system`.
2. Instance what exists.
3. Hand-draw only what genuinely has no component — and say so explicitly in your report.

The same applies in code: `src/components/ui/` and `src/components/shell/` are the only places
shared UI may be defined.

---

## 3. Component inventory

Verified on the Design System page (`26:84`). Instance these; do not redraw them.

### Shells and bars
| Component | Node | Variants |
|---|---|---|
| Patient AppBar (Avatar + Logo + Bell) | `741:887` | `Back=Hidden \| Shown` |
| Patient BottomTabBar (Home/Overview/Inbox/Community/Lifestyle) | `740:1015` | `Active=Home \| Overview \| Inbox \| Community \| Lifestyle` |
| Practitioner AppBar | `656:850` | `Back=Shown \| Hidden` |
| Practitioner BottomNav | `381:628` | `Active=Home \| Appointments \| Inbox \| Patients \| Profile` |
| Detail AppBar (Back + Title + Action) | `193:120` | — |
| Signup AppBar (Back + Stepper + Help) | `292:607` | `Step=1 \| 2 \| 3` |

Patient screens get the patient bar + bottom tab bar. **Detail** screens get `Detail AppBar`
and **no** bottom nav. Practitioner screens get the practitioner pair and never the patient tab
set. A tab root must not get a back button — the patient bar's default variant is `Back=Hidden`
for exactly that reason, and `PatientAppBar`'s `hideBack` prop defaults to `true` to match.

The default variant of each patient set is the node the whole app already instances
(`101:142` for `Back=Hidden`, `101:143` for `Active=Home`), so adding these two axes changed
nothing on the 26 existing instances. `Patient BottomTabBar` deliberately has **no**
`Active=Appointments` value: Appointments is not one of the five tabs, and
`appointment_management` is a detail screen.

### Content and controls
| Component | Node | Variants |
|---|---|---|
| Card / Form | `435:503` | — |
| Input | `1:52` | `State=Default \| Focused \| Error` |
| Checkbox | `1:70` | `State=Unchecked \| Checked` |
| ConsentRow | `434:1161` | `State=Unchecked \| Checked` |
| IconTile | `517:1515` | `Size=32\|40\|48\|56` × `Tone=Tint\|Accent\|Neutral` |
| KeyValueRow | `517:1772` | `Emphasis=Value\|Label` × `Trailing=None\|Badge\|Action\|Chevron` |
| Section Header | `517:689` | — |
| Tab | `517:1513` | `State=Default \| Active` |
| Tab Strip | `517:1574` | `Active=For You \| Following \| Explore \| Community` |
| SocialButton | `301:180` | `Brand=Google \| Apple` |
| TrustBadge | `301:181` | — |

**Tab Strip is not ChoiceChip.** A tab swaps which collection is shown; a chip filters in place.
Collapsing them turns the accessibility role into a prop.

### Async states — design these, don't skip them
| Component | Node | Variants |
|---|---|---|
| EmptyState | `517:1773` | `Container=Card\|Inline` × `Action=Yes\|No` |
| ErrorPanel | `517:2111` | `Container=Card \| Inline` |
| SkeletonCard | `517:2291` | `Shape=Provider card \| List row \| Stat tile` |

Roughly 20 backend-bound screens still have no loading/empty/error branch. A screen designed
only in its happy, fully-populated state is how those get invented per-PR later. `SkeletonCard`
must reserve the **exact** layout of what it replaces, or it causes the layout shift it exists
to prevent.

### Brand
| Component | Node |
|---|---|
| Mark / Continuity Dots | `356:616` |
| Icon / Wordmark | `26:90` / `26:98` |
| Icon / Wordmark — Reversed (on dark) | `180:351` / `180:344` |
| logo/google-g · logo/apple | `300:173` · `300:167` |

Never render the logo as text or a redrawn mark.

### Code counterparts
`src/components/ui/` — `AvatarWithFallback`, `Badge`, `Button`, `Card`, `ChoiceChip`,
`ConsentRow`, `Input`, `Logo`, `SearchField`, `VitalStatCard`, `AppearanceSelector`,
`icons/Icon`, `brand/`.
`src/components/shell/` — `PatientAppBar`, `PatientShell`, `PractitionerAppBar`,
`PractitionerBottomNav`, `PractitionerShell`, `DetailAppBar`.
`src/features/home/components/BottomNav` — the patient bottom nav.

`src/components/ui/icons/Icon.tsx` is the **only** file permitted to import an icon library.

---

## 4. Screen status

**Verified against a live page-by-page read of the Figma file on 2026-08-03.** The previous
version of this section was badly stale — it still listed eleven screens as undesigned that had
frames, including the whole booking flow, both script screens and all three telemedicine screens.
A status list nobody re-derives is worse than no list, because it gets planned against. Re-read the
file before trusting it again.

**Designed** — every route below has at least a populated frame, and most have state frames and a
dark proof:

| Area | Screens |
|---|---|
| Sign Up | `sign_up` `1:34` · `sign_up_verify` `447:455` · step 2 `11:38` · step 3 `38:93` |
| Onboarding & Auth | `splash` `50:105` · `sign-in` `57:102` (+ `765:696` no-biometric) · `onboarding_status` `72:117` · `forgot_password` `949:10169` · `privacy` · `terms` |
| Patient Home | `index` `93:102` · `patient-dashboard` `110:244` · `patient-profile-overview` `261:387` · **`overview` `949:10550`** |
| Find Care & Booking | `find-care` `144:108` · `doctor_profile` `164:195` · `select-time-slot` `756:4384` · `review-appointment` `756:4213` · `booking-confirmed` `756:4742` |
| Messaging | `inbox` `550:2283` · `chat-thread` `552:1376` · `ai-assistant` `550:2700` |
| Appointments | `appointments` `550:1826` |
| Overview & Medications | `active-medications` `559:615` · `medication-details` `828:5944` · `active-script-view` `828:1187` · `active-script-share` `828:5628` |
| Practitioner | `active-patient-roster-2` `626:4007` · `patient-record` `678:615` |
| Telemedicine | `practitioner-telehealth-profile` `831:767` · `waiting-room` `833:857` · `telemedicine-consultation` `837:1190` |
| Shell | `AccountMenu` `945:5796` (page) — **needs promotion to the Design System page; see §5** |

**Still undesigned** — none. `community` `949:13725`, `lifestyle` `949:13130` and
`lifestyle_manage` `954:931` were delivered by run `wf_eb1c9d70-aeb` on 2026-08-05, which closes the
"built in code, absent from Figma" gap for every patient screen.

The round's review gate FAILED those three, and **all four of its findings are now cleared** (see
§5): dark proofs exist and are proven to flip by pixel measurement (`983:14194`, `983:14243`), the
opaque scrim `981:1549` is at 40%, the fifteen-item code-vs-frame list is written into §5, and the
invented "Akosua Mensah" is now the seeded "Ama Mensah" in both component defaults. The frames are
buildable. The fifteen code-side items are Build work, not design blockers.

**Stubs, unfinished** — `152:148` Explore and `175:190` specialist_profile. `175:190` is worth
finishing or deleting rather than leaving: it is where "Dr. Sarah Jenkins" and "Accra" leaked into
the booking round from, because agents looking for plausible content found the nearest frame on the
page. A half-finished frame is not inert; it is a content source.

**Figma-only, with no route in the app** — `doctor_profile` `164:195`,
`explore_discovery_directory_updated_actions` `158:148`, `Patient Home / New User Onboarding`
`82:105`, `nutritionist` `176:340`. Each is either a screen nobody built or a frame nobody needs;
worth deciding which, per frame.

---

## 5. Handoff protocol

The **frame is the handoff artifact** — not a conversation. Append entries here; both agents
read this section.

Format: `YYYY-MM-DD — <agent> — <what> — <node ids / file paths> — <what the other side should do>`

- 2026-08-05 — Claude — **CLAIM page `1019:640` "Facilities" — `hospital_detail`, `pharmacy_detail`.
  DELIVERED, and the hospital CTA turns out to be unhonourable.**

  | Frame | Node |
  |---|---|
  | `hospital_detail` | `1020:641` |
  | `hospital_detail — not found · load failed` | `1022:17252` |
  | `hospital_detail — dark proof` | `1022:17473` |
  | `pharmacy_detail` | `1022:16476` |
  | `pharmacy_detail — no pharmacists listed` | `1022:17278` |
  | `pharmacy_detail — dark proof` | `1022:17511` |
  | `Local Components — facilities` | `1019:641` |

  **"View Staff" IS NOT BUILDABLE, and the frame says so rather than faking it.**
  `hospital_service/app/routers/hospitals.py` exposes only **`POST /v1/hospitals/{id}/staff`** —
  there is **no GET** — and `HospitalStaffOut` carries `user_id`, `role`, `title`, `department` and
  **no name or photo**, with no user lookup in the service. So the Care team section is an
  `EmptyState` reading "Staff directory not published" (`1020:16283`), drawn rather than omitted
  because the button that lands there promises staff. **Required code work:** `adaptHospital`
  (`features/care/api.ts:195`) must change `cta.label` from "View Staff" to **"View hospital"** until
  backend ships a GET route *and* name resolution. A label that outlives its data is a lie.

  **The pharmacy side is fully backed and needs no backend work** — `PharmacyOut` carries
  description, licence number and categories, the full seven-day `operating_hours`, phone, email,
  website, photo and insurance; `GET /v1/pharmacies/{id}/stock?drug_name=` returns
  available/quantity/price/currency/source; `GET /v1/pharmacists?pharmacy_id=` returns staff.

  **REFUSED for want of a column — do not add these later without one:** hospital staff names,
  review attribution (`reviewer_user_id` only), aggregate rating, distance in km (hospitals accept no
  lat/lng query, unlike nurses), hospital opening hours, "24/7 emergency", hospital photo, bed count,
  departments, wait time; pharmacy "Open now" (`api.ts` records why it is timezone-unsafe — the hours
  table with a Today row says the same thing honestly), delivery, ratings, reviews, pharmacist
  ratings and verified ticks (`is_listable` is not verification).

  **DEFECT REPORTED in `find_care` (read only):** `FacilityCard` instances carry four fields with no
  backing column — `916:2360` reads "Osu, Accra · 2.4 km · Open 24 hrs" with a "24/7 emergency"
  badge; `916:2386` reads "· 0.8 km · Closes 22:00" with "Delivery".

  **FLAGGED — the seed contains no pharmacies, hospitals or pharmacists at all.** The two
  `PractitionerSummaryRow` instances use roster names Kwabena Osei and Abena Owusu per the naming
  rule, but both are seeded as **doctors with other specialties** — a role conflict, so those rows
  are **not canon**. Needs seeded pharmacists with PO-chosen names (§5c 2b).

  Built local, proposed for promotion: `HoursRow 1019:650` (`Emphasis=Default|Today` — `KeyValueRow`
  stacks label above value and has no today emphasis) and `HospitalReviewCard 1019:16078` (the file
  has no review component; `doctor_profile`'s is a hand-drawn frame).

  Verification: 0 unbound SOLID paints across all seven roots (fills + strokes, `visible:false`
  excluded); 0 FIXED-width descendants wider than the 296px worst-case 360dp content box; both dark
  proofs screenshot-verified to invert rather than render as a slab.

- 2026-08-05 — Claude — **CLAIM page `1018:640` "Practitioner Shell" — `practitioner-home`,
  `practitioner-profile`. DELIVERED (design gate only; Build + BuildReview still owed, §5c 8–9).**

  These are the two destinations `PractitionerBottomNav` has been shipping as `href: null`.
  **`practitioner-profile` is the CLINICIAN'S OWN profile** — `practitioner-social-profile` and
  `practitioner-telehealth-profile` are both patient-facing views of a specialist and are not
  duplicated.

  Frames: `1019:673` home—today · `1022:853` no consultations · `1022:16729` home DARK proof ·
  `1020:16094` profile—listed · `1022:918` not listed in Find Care · `1022:16587` account & sign out
  (scrolled) · `1022:16745` profile DARK proof · `1022:16777` home @360dp · locals `1018:641`.

  **FLAG 1 — MISSING ENDPOINT, and it blocks the whole Schedule tab.**
  `booking_service/app/services/booking_service.py:112-119`: `all_bookings=true` is admin-only, and
  otherwise the query filters `Booking.user_id == principal`. `doctor_id` only ANDs on top — so
  `GET /v1/bookings?doctor_id=<self>` returns bookings where the doctor is the **patient**. A
  practitioner cannot list their own patients' bookings. `/summary` has the identical gap.

  **FLAG 2 — `Practitioner BottomNav 381:628` OVERFLOWS 360dp**, the same defect just fixed on the
  patient bar: five `FIXED 75` items in a SPACE_BETWEEN row with 8px padding = 391 required. Measured
  at 360, `TabItem/Profile` spans x=283.2→383, so 23px of touch target is off-screen and the label
  clips. **The code is immune** (`flex-1` per Pressable) — this is component-side only. Fix on
  `26:84` when no claim is open; `1022:16777` overrides its instance to FILL to show real rendering.

  **FLAG 3 — Figma and code disagree on the tab-root app bar.** In `Practitioner AppBar Back=Hidden`
  the back glyph is `visible:false` and `SPACE_BETWEEN` resolves the Logo to `x=16` (left);
  `PractitionerAppBar.tsx:128` instead renders a 44×44 spacer and keeps it centred at 141.5. One of
  the two must change.

  **FLAG 4 — ~~PRODUCT DECISION~~ DECIDED 2026-08-05 by the PO: the account menu goes ON
  practitioner-profile**, not behind a new avatar in the practitioner app bar. So
  `PractitionerAppBar` keeps no avatar slot, and mounting the menu is part of BUILDING
  practitioner-profile — it is not a shell edit. **Until that screen ships, a clinician still cannot
  sign out or change appearance**; the dimmed tabs make the gap visible but do not close it.
  Original finding follows.** `AccountMenu` is mounted
  only by `PatientShell.tsx:226` behind the patient avatar; `PractitionerShell` never mounts it and
  `PractitionerAppBar` has no avatar — so **appearance and sign-out are unreachable for a clinician
  today**. Placed on practitioner-profile (`1022:16587` proves reachability). Confirm that versus
  adding an avatar to the practitioner bar.

  Also: the app bar component hardcodes a **"3" unread badge** while the app has no notifications
  model (hidden on these instances; needs a `Badge=Shown|Hidden` axis); `SecurityToggleCard 337:798`
  is the file's only toggle row and wants an audience-neutral name on promotion; the Account "Email"
  row is not on `DoctorProfile` and crosses into the user service; and **`color/on-success-container`
  does not exist** in the Colors collection although `ActivePatientRoster2Screen.tsx:762` uses it.

  Built local: `Consultation Card / Practitioner 1018:667`. `AppointmentCard 550:2593` could not be
  reused — its identity property is literally `Practitioner name#550:50`, and a practitioner-side
  card is keyed on the PATIENT. Proposed for promotion, or an `Audience=Patient|Practitioner` axis.

  Verification: 965 nodes audited, **0 unbound visible paints**; mode pins on the two dark proofs
  only; both screenshot-verified to invert.

- 2026-08-05 — Claude — **NOT DELIVERED: `consultation-summary` and `edit-profile`.** The agent was
  killed by a session limit while probing `Input 1:52` / `Button 1:89` internals; it had established
  the token and component ground truth and had written nothing to the file. **Nothing to clean up —
  no page was created and no frames exist.** Resume from scratch. The brief still stands, including
  the modal-vs-screen call (full pushed screen, on the grounds that a profile edit spans many fields
  with per-field validation while this file reserves sheets for a single decision) and the hard
  constraint that **a field `user_service` cannot persist must not appear in an edit form**.

- 2026-08-05 — Claude — **THE INERT-CONTROL AUDIT: 16 dead controls, split into what can be built
  today and what cannot.** Asked for "all tooltip calls functional". Enumerated rather than
  estimated, because half of them cannot be made functional honestly and quietly stubbing those would
  put controls in a user's hand that look alive and do nothing.

  **BUILDABLE — device APIs only, no backend. In progress (three agents, 2026-08-05):**

  | Control | Where | Mechanism |
  |---|---|---|
  | Attach file | `AiAssistantScreen`, `ChatThreadScreen` — `IconButton` with **no `onPress` at all** | `expo-document-picker` |
  | Voice input | `AiAssistantScreen` — same, no handler | `expo-audio` (NOT `expo-av`, which is superseded) |
  | Share medication list | `ActiveMedicationsScreen:47` — currently an `Alert` reading "will be available" | RN `Share` / `expo-sharing` |
  | Share (post, clinical data, appointment) | `CommunityScreen:632`, `ChatThreadScreen:450/502`, `BookingConfirmedScreen:479` | same |
  | Download PDF | `ActiveScriptViewScreen:384` — `showDownloadToast`, a stub | `expo-file-system` + `expo-sharing` |
  | Download report | `OverviewScreen:334` | same |

  Dependencies were installed **centrally** rather than per agent — three concurrent `expo install`
  runs would have collided on the lockfile.

  **Download has an honest-scope problem that was handed to the agent as a decision, not a fudge:**
  there is no PDF generator installed (`expo-print` is absent and was deliberately not added) and no
  endpoint returns a PDF. So either the button stops saying "PDF" and produces a real text/HTML file,
  or it becomes explicitly unavailable. What it must not do is keep the label and produce something
  else. **A control that lies is worse than one that is disabled.**

  **NOT BUILDABLE — blocked on backend. FLAGGED, deliberately left inert:**

  * **Video call** — `ChatThreadScreen:366`. Telehealth signalling does not ship yet.
  * **Message a provider** — `FindCareScreen:689`. `/v1/social` is not exposed.
  * **Specialty picker** — `FindCareScreen:453`. `/v1/doctors/specialties` does not exist. (This is
    also why `PickerTrigger` is still a local component and why the Figma chip was not converted.)
  * **New conversation** — `InboxScreen:331`. No messaging endpoints.
  * **Google / Apple sign-in** — `SignUpStep1Screen:416/423`. OAuth unwired since the first pass.
  * **Cancel appointment** — `AppointmentManagementScreen:912`. No `DELETE` route; note the comment
    there still names `/v1/appointments`, **an endpoint that does not exist and is not coming** — the
    same invented path that once shipped past 595 mocked tests. The real collection is `/v1/bookings`.
  * **Consultation summary** — `AppointmentManagementScreen:1033`. The destination screen does not
    exist.

  Each of these is a real product gap, not laziness, and each needs a backend or a design before it
  can be wired. The rule applied: **flag, do not fake.**

  — Found in passing and folded into the composer work: `AiAssistantScreen` imports `MaterialIcons`
  **directly** (a BRAND violation — `Icon.tsx` is the only file permitted to) and passes a raw
  `#ffffff` to the send glyph, which in dark mode is white on `primary` at roughly **1.9:1**.

- 2026-08-05 — Claude — **`find_care`'s chips are `ChoiceChip` instances, and the Helpful Resources
  glyphs are canonical.** Closes the item the Design System pass unblocked.

  **Nine chips instanced** (`144:281`…`144:305` → `1012:2759`…`1012:2793`): six type chips against
  `Layout=Hug, State=Default|Selected`, three facet toggles the same. Widths moved by at most 2px and
  the wrap packing is unchanged (2 lines + 2 lines at 361), so this is a pure canonicalisation. The
  two selected chips now get their check from the **State axis** rather than a hand-drawn tick — the
  thing the new structural Check buys.

  **"Specialty" is deliberately NOT converted.** It is a PICKER TRIGGER — the chevron means "opens a
  menu" and it holds no selected state — and `ChoiceChip.tsx` records why: letting a chip absorb
  arbitrary trailing chrome is the exact drift the extraction removed. It stays a local frame until
  the Design System has a trigger primitive (or 11:104 gains a `trailing` property).

  `Show icon` was left at its default **false**, so the swap changes no content. The code DOES draw a
  leading glyph on five of the six type chips; that divergence is separate and still open — closing it
  means choosing five glyphs, which is a content decision, not a swap.

  ---

  **Helpful Resources glyphs (`82:105` Patient Home / New User Onboarding) were hand-drawn
  approximations, not components.** Reported from the canvas. All three were local 24×24 frames
  holding a single crude vector — `14x18` for a shield, `14x14` for a sparkle, two `10x16` for a book
  — which is why they read as a blob, a paper plane and a set of bars rather than the glyphs they were
  named after. Replaced with instances:

  | Tile | Was | Now |
  |---|---|---|
  | Data Privacy | local `icon/shield`, one 14×18 vector | **`icon/chrome-shield` 1011:919** (new) |
  | AI Assistant | local `icon/sparkle`, one 14×14 vector | `icon/chrome-auto-awesome` `550:831` |
  | User Guide | local `icon/book`, two 10×16 vectors | `icon/chrome-article` `949:10328` |

  `icon/chrome-shield` is **new**, created rather than approximated: the file had no shield or lock
  glyph at all. Drawn from an SVG path as a 2px stroked shape to match the file's stroke-drawn icon
  convention, stroke bound to `on-surface-variant` as a neutral default like its siblings. The code
  side needs nothing — `ChromeIconName` is the whole MaterialIcons union, so `<Icon chrome="shield" />`
  already type-checks.

  All three instances are tinted to **`color/on-primary-container`**, which is the pair of the 48px
  plate's `primary-container` fill, so they flip with the mode instead of being frozen white.

  **MECHANISM, and it cost a screenshot:** the glyphs they replaced were
  `layoutPositioning="ABSOLUTE"` siblings overlaid on the plate, inside a HORIZONTAL auto-layout
  `TipTile`. A fresh instance defaults to `AUTO`, so it joined the flow and the plates rendered
  **completely empty** — worse than the defect being fixed. When replacing an absolutely-positioned
  child in an auto-layout parent, set `layoutPositioning = "ABSOLUTE"` on the replacement before
  trusting x/y. Verified by screenshot both times, which is the only reason it was caught.

- 2026-08-05 — Claude — **DESIGN SYSTEM PASS: `ChoiceChip` and `Button` have icon axes, and the
  prototype is re-cloned.** Closes both remaining leftovers.

  **`ChoiceChip 11:104`** — the three gaps its RN counterpart had flagged in a file comment, now
  closed, in the order that file asked for:
  * `Show icon` (BOOLEAN, default **false**) + `Icon` (INSTANCE_SWAP) — a 20px leading glyph, BRAND's
    dense-row size. Four live call sites draw one.
  * A trailing **Check on `State=Selected`**, and **deliberately not a boolean.** The request read
    "11:104 should gain the check to State=Selected", and structural is the stronger contract:
    selection then always carries a non-colour signal (docs/MOBILE_UX.md) and cannot be switched off
    per instance. The node lives in all six variants with `visible` following the State axis, so
    toggling State in an instance brings the check with it. Verified on a probe.
  * Gap bound to `spacing/4`.

  **`Button 1:89`** — `Show leading icon` / `Leading icon` and `Show trailing icon` / `Trailing icon`,
  both booleans defaulting **false**, which is what the code does: `leadingIcon`/`trailingIcon` are
  optional and the app passes `trailingIcon` on **8 of 59** call sites, all auth/onboarding CTAs.

  What was actually wrong there: the arrow was **hand-drawn and unconditionally visible** in Primary,
  Disabled and Loading, and **absent from Secondary** — so switching Variant changed the anatomy, and
  ~90 instances inherited an arrow nobody chose, including "Close", "Revoke", "Try again" and
  "Export". All four variants now carry both slots, and the **20 auth/onboarding CTA instances have
  the arrow explicitly re-enabled**, so nothing regressed. Loading instances are deliberately left
  off — the code hides icons behind the spinner (`trailingIcon && !loading`).

  New component **`icon/chrome-arrow-right` 1002:890**, extracted because the arrow had three
  hand-drawn copies and no single definition.

  **Also canonicalised: the splash CTA.** `51:114 "Get Started Button"` was a hand-drawn frame, not a
  Button instance — which is why splash never appeared in the trailing-icon candidate list. It was
  h49 / **radius 999** against the component's h56 / `radius/12`. Now a `Variant=Primary` instance
  with the arrow on. One less private button.

  **TWO MECHANISMS worth keeping, both cost a cycle:**
  1. **Non-variant component properties must be added to the SET, not a variant.**
     `variant.addComponentProperty(...)` throws *"Can only set component property definitions on a
     product component"*.
  2. **`findAll()` does NOT traverse into a node whose `visible` is false**, and `instance.children`
     omits invisible children too. A hidden slot therefore receives **no bindings silently** and
     keeps the source component's colour — which only becomes visible the moment a caller turns the
     slot on. The first tint pass bound an invisible root fill and left every glyph on
     `on-surface-variant`. Unhide, bind, restore.

  Related: these glyphs are **stroke-drawn** (`fills: []` plus a 2px stroke), so a tint that only
  walks `fills` is a no-op on them.

  **KNOWN LIMITATION, documented on both components:** swapping a glyph via INSTANCE_SWAP **loses the
  token binding** — the replacement arrives with its own source colour (verified: swapping to
  `icon/person-search` gave `on-surface-variant` where the slot was `on-surface`). Figma has no
  `currentColor`, so re-bind after a swap. There is no way to make it automatic today.

  ---

  **PROTOTYPE `906:609` re-cloned — TARGETED, and that was the right call.** Six frames replaced:
  `splash` and `find_care` (their sources changed today), plus `overview`, `community`, `lifestyle`
  and `lifestyle_manage`, which were dashed **"NO FIGMA FRAME"** placeholders until those designs
  landed. The other 18 frames were left alone: their sources have not changed, and a blanket re-clone
  would have meant recreating **37 working connections** by hand for no gain, with every one
  recreated a chance to wire it wrong. The provenance card now says which were re-taken and which
  were not.

  **55 connections, 0 dangling, 0 orphans, 5 entry points** — each number checked, not asserted.

  Wiring changes worth naming:
  * **All five patient tab roots are now interconnected — 20 edges.** This was impossible before,
    because three of the five had no frame. The active tab is a no-op, matching PatientShell.
  * **`find_care` lost its tab-bar edges and gained a Back edge**, because it is a DetailShell screen
    now. Back is a `BACK` action rather than a fixed destination, matching `router.back()` — a
    hardcoded Home would send a user who arrived from Appointments to the wrong place.
  * `lifestyle` to `lifestyle_manage` is wired **twice**, because the screen offers two ways in (the
    "Log Daily Activity" CTA and the "Go to Log" button).

  **TRAP: deleting a destination frame silently DROPS the reactions that targeted it** — it does not
  leave a dangling edge you can find by scanning. `find_care`'s two inbound routes (patient_home's
  Find Care tile, appointment_management's "Book new") vanished with the old clone and were only
  caught by an ORPHAN check — "which screens can nothing reach?" — not by a dangling-edge check,
  which read clean at zero the whole time. Both restored. Also: cloning frames auto-created two
  unnamed "Flow 1"/"Flow 2" starting points, and the deleted splash left a dangling entry, so
  `flowStartingPoints` was rewritten wholesale rather than patched.

  **Four GAP cards became RESOLVED** and were rewritten rather than deleted, keeping the reason:
  Inbox-from-three-tabs, 3-of-5-tab-items, Inbox-unreachable, and
  lifestyle-to-lifestyle_manage-undeliverable. The first three were closed by PatientShell's single
  tab map replacing six hand-written switches, three of which had omitted Inbox entirely.

  — ~~**NOW UNBLOCKED, not done:**~~ **DONE the same day** — see the entry above: nine of the ten
  chips are `ChoiceChip` instances (`1012:2759`…`1012:2793`), widths moved ≤2px and the packing did
  not change. "Specialty" stayed local on purpose: it is a picker trigger, not a chip. Annotated here
  rather than only above, because a reader who lands on this line would otherwise plan against a
  blocker that is gone — the same mistake as the gate retraction filed below the entry it corrected.

- 2026-08-05 — Claude — **`find_care`'s chip rows WRAP now, and the chips are on the radius token.**
  Closes leftover (2) from the chrome entry below.

  Both rows were `HORIZONTAL` / `NO_WRAP` / `clipsContent: true` at 393 wide with their own 16px
  padding — i.e. clipped scrollers, which is what the code stopped being on 2026-08-03 after the
  360dp device pass found "Hospitals" sliced mid-word. Now `layoutWrap: WRAP`,
  `counterAxisSpacing: 8`, `counterAxisSizingMode: AUTO`, `clipsContent: false`, and the rows sit at
  x=16 / w=361 with **no padding of their own** — the screen's gutter defines the inset once, which
  is the code's arrangement verbatim ("a wrapping row adds no padding of its own").

  Figma computed the packing; both rows land on 2 lines at 96px:

  | Row | Line 1 | Line 2 |
  |---|---|---|
  | type | All · Doctors · Nurses · Hospitals (359 of 361) | Pharmacies · Pharmacists |
  | facet | Specialty · Available Now | Home Service · Nearest |

  **Note this is NOT the code's packing, and both are correct.** The code comment records 3 lines for
  the type row and 2 for the facet row — that is the packing at **328dp** (a 360dp device), while the
  frame is drawn at **393**, so it fits one more chip per line. A wrapping row is defined by its rule,
  not by a line count; the frame showing a different break at a different width is the mechanism
  working. Nobody should "fix" either to match the other.

  Reflow: rows 44 → 96 each, so everything from the first Section Header down moved +100, and the
  frame is 1176 → 1276. Gaps taken from the code rather than the frame's previous values — 16 from the
  search field, **8 between the two rows** (the frame had 12, which was drift), 16 to the first
  section.

  **The chips' `cornerRadius: 999` is gone — bound to `radius/12` (`VariableID:1:24`), read off the
  canonical `ChoiceChip 11:104` rather than typed as a literal.** All ten. A pill radius is what
  BRAND scopes to pills and avatars, not chips, and it is the same defect the code fixed when
  `MainChip` was retired for the shared component.

  **FLAGGED — the local chips are NOT instances of `ChoiceChip 11:104`, and they cannot be yet.**
  §5c step 2 wants one definition, so this looks like it should be a swap. It is not: `11:104`'s six
  variants (`Layout=Hug|Fill` × `State=Default|Selected|Unavailable`) are **text-only — no icon slot
  and no selected-check slot**. The built screen renders a leading glyph on five of the six type chips
  AND a check on the selected one (`showSelectedCheck` defaults on), and that check is what keeps
  selection from being colour-only, which BRAND requires. Instancing `11:104` today would therefore
  DELETE two things the code deliberately has, so **the component is behind the code here, not the
  frame**.
  What it needs: `Icon = None | Leading` and a `Show check` boolean on `11:104`, after which the ten
  hand-drawn frames become instances. That is the same missing-axis request already open for
  `Button 1:89` (lifestyle item 14) — worth doing both in one Design System pass rather than twice.

- 2026-08-05 — Claude — **The stale chrome is out of the frames too — and it was THREE frames, not
  two.** Closes the design-side item left open by the DetailShell migration below.

  | Frame | Was | Now |
  |---|---|---|
  | `find_care` `144:108` | `Patient AppBar Back=Hidden` `144:109` + `BottomTabBar` `145:320` + a 28px body "Find Care" | `Detail AppBar` instance **989:2570**, title "Find Care" |
  | `Patient Dashboard` `110:244` | `Patient AppBar Back=Hidden` `110:245` + `BottomTabBar` `110:258` | `Detail AppBar` instance **990:1929**, title "Dashboard" |
  | `Patient Profile Overview` `261:387` | `Patient AppBar` **`Back=Shown`** `261:388` | `Detail AppBar` instance **990:1935**, title "Profile" |

  **`261:387` was the one I had written off.** The migration entry below says it "needs nothing — it
  was already correct", and that was true of its NAV (it never had a tab-bar instance, which is what
  the ruling turned on) but not of its BAR: it carried `Patient AppBar Back=Shown`, so it had a back
  button and still the tab-root lockup with the logo. Checking all three rather than trusting that
  note is what caught it.

  On each instance the **Action Button is hidden**, because none of the three screens passes `actions`
  to `DetailShell`. A visible share glyph wired to nothing is the dead-bell defect that got removed
  from `appointment_management`.

  `find_care` also lost its **duplicated body heading** and was reflowed: the 28px "Find Care" sat at
  y=88 while the bar now carries the name, so it went and the nine elements below moved up 60 (the
  SearchField lands at 64+16=80, matching the code's `paddingTop: 16`). Frame height 1304 → 1176:
  content bottom plus the 32 bottom padding that replaced the 140 which had been clearing the tab bar.
  `110:244`'s height is deliberately unchanged — its ScrollContent already ran past the frame before
  this, so it is a tall scroll mock rather than a viewport, and resizing it would be a judgement about
  the mock, not about chrome.

  **File-wide audit, because the same defect could sit on frames nobody named:** all `740:1015`
  instances enumerated via `variant.instances` — **29 remain and every one is legitimate**, on a real
  tab root (`patient_home`, `overview`, `inbox`, `community`, `lifestyle`), on a sanctioned dark or
  360dp proof of one, on an account-menu frame (which overlays a tab root, so the bar belongs), or on
  the Figma-only Explore stub. No delivered screen wears a tab bar it should not.

  **Two leftovers found by that audit, NOT fixed:**

  1. **`Prototype — App Flow` holds `find_care — copy 2026-08-02`, still with the old chrome.** The
     prototype page is a set of clones, so it is stale the moment a source screen changes — it also
     still holds `patient_home`, `inbox` copies from the same date. The fix is re-cloning the
     prototype and re-running `setReactionsAsync` / `flowStartingPoints`, not patching the clone,
     because a patched clone diverges from its source silently. Same re-clone that was already needed
     after the nav change.
  2. **`find_care` `144:108` is still stale on its CHIP ROWS.** Both are drawn as horizontal
     scrollers — the frame names literally say "horizontal scroll (chips may extend past the frame
     edge)" — but the code was changed on 2026-08-03 to **WRAP** them, because at 360dp the type row
     needs 705dp against a 328dp column and was slicing "Hospitals" mid-word. The code is right and
     the frame is wrong here. Redrawing two wrapping rows is a layout change rather than a chrome
     swap, so it is logged rather than bundled into this one.

- 2026-08-05 — Claude — **`Patient BottomTabBar 740:1015` no longer overflows 360dp. Figma-only —
  DO NOT "fix" the code.** All 25 tab items (5 variants × 5 tabs) go from `FIXED 75` to **`FILL`**.

  The defect as measured: five `FIXED 75` items = 375, plus `paddingLeft 8` + `paddingRight 8` =
  **391 required**. At 393 that fits with 2px spare; at 360 it overflowed by 31 and clipped the
  Lifestyle label — on **every patient tab root**, not one screen. `FILL` rather than a
  hand-computed `FIXED 68.8`, because a fixed width only moves the breakpoint: it would fit 360 and
  fail 320, and be wrong again the next time a tab is added.

  **The RN code was already correct and is deliberately unchanged.** `BottomNav.tsx` renders each tab
  `className="flex-1 …"` inside a bar with `px-base`, and `base` is **8px** (tailwind.config.js:55),
  so the code already gets (360−16)/5 = **68.8dp** per tab. This entry says so explicitly because the
  finding as originally written ("affects every patient tab root") reads like an app bug, and the
  obvious next move — hunting for a fixed width in the code — would find nothing. The component was
  the thing that disagreed with the code, not the reverse.

  Verified on throwaway 360 and 320 clones of `Active=Community` (the widest label lit), measured
  then deleted — zero TEMP nodes remain:

  | width | per tab | widest label | result |
  |---|---|---|---|
  | 393 | 75.4 | Community 66 | fits (was 75 — visually unchanged) |
  | 360 | 68.8 | Community 66 | **fits**, all five labels whole, confirmed by screenshot |
  | 320 | 60.8 | Community 66 | **label overflows** — see the limit below |

  **MEASURED LIMIT, recorded rather than glossed:** labels are typeset Inter Medium 12 and
  "Community" is the widest at **66px**. Each tab gets (W−16)/5, so the label stops fitting below
  **~346dp**. 360 and 393 are both clear, so nothing shipping today is affected. Below 346 the code
  ellipsizes rather than clips (`numberOfLines={1}`), so it degrades legibly — but a narrower device
  needs **shorter labels**, not a smaller font: BRAND's floor is 12sp and the ramp has nothing below
  it. The same reasoning and the same numbers are now in the component's own `description` in Figma,
  so they travel with it.

- 2026-08-05 — Claude — **"Akosua Mensah" is gone from the Account Menu — and it was in the
  COMPONENT DEFAULTS, not the instances.** The gate found it on frame `949:10931`; the cause was one
  level deeper than the report. `scripts/seed_dev_data.py` seeds `first_name: "Ama"`,
  `last_name: "Mensah"`, `ama.mensah@medapp.dev` — there is no Akosua anywhere in the seed file.

  Fixed at source: `949:10517` (inside `View=Menu` `949:10512`) and `949:10631`, the two component
  defaults. Seven instances inherited the wrong name without overriding it, so all seven corrected
  themselves — re-scan of page `945:5796` returns **zero** occurrences of "Akosua" and nine of
  "Ama Mensah". Fixing the seven instances instead would have left both defaults poisoned, and the
  next instance anyone drew would have brought it straight back. This is §5c step 2b in practice: a
  shared component stops structural drift, but only a corrected DEFAULT stops content drift.

  Same defect class as `Alex Rivers` and `Dr. Sarah Jenkins`. **The initials "AM" happened to match**,
  which is exactly why it survived review — the identity block looked internally consistent.

- 2026-08-05 — Claude — **CLAIM CLOSED `945:3923` "Lifestyle"** — `lifestyle` `949:13130`,
  `lifestyle_manage` `954:931`, plus state frames `978:1084` (all medications taken), `979:1781`
  (AI recommendation returned), `981:1488` (workout plan picker open), and the two dark proofs
  added below. This entry exists because the review gate found there was none: the page had been
  designed and its whole findings list lived only in a subagent transcript, which is the same as
  not existing. Recovered from `wf_eb1c9d70-aeb` and written down.

  **The round ended with the Figma bridge disconnected**, and the agent said so rather than
  claiming completion — `use_figma` returned `Not connected` for its last ~10 minutes. Exactly two
  deliverables were missing as a result, and both are now done (verified, below):

  * **Dark proofs — DONE.** `lifestyle — Dark proof (pinned Colors/Dark)` **983:14194** and
    `lifestyle_manage — Dark proof (pinned Colors/Dark)` **983:14243**, both pinned
    `VariableCollectionId:1:2 → 197:0`, the same pin the accepted overview proof `949:13208`
    carries (read off it, not typed from memory). **Proven by pixel measurement, not by eye**,
    because "it looks dark" is what the opaque-scrim defect below also looked like: `lifestyle_manage`
    light is mean-luminance 238.1 with 92.7% light pixels; its dark proof is mean 42.6 with 91.4%
    dark pixels — a near-perfect inversion. The `lifestyle` proof is mean 57.5 / 82.2% dark (higher
    mean because that screen carries more coloured cards). Both render **1000+ distinct colours**,
    which is the check that separates "flipped correctly" from "covered by a flat slab".

  * **The opaque scrim on `981:1488` — FIXED.** `981:1549` was named "Scrim (color/scrim @40%)" and
    rendered at 100%, hiding the wordmark, the AI Meal Planner card, Daily Vitality Log, Mindset
    Check-in and the SaveCloseFab completely. Cause found on inspection: **node opacity 1 AND fill
    opacity 1** — nothing anywhere was at 40%. Fixed to node `opacity = 0.4`, which is the
    convention the account menu's working scrim `949:10988` already uses (full-opacity fill bound to
    `color/scrim`, dimming done on the node). Note the agent's own proposed fix was fill-opacity
    based; it would have worked visually but left the file with two different ways to build a scrim.
    Verified by screenshot: all four hidden elements legible again, fill still bound to the token.

  **Where the CODE is wrong and the frame is now right — required Build work.** Fifteen items, none
  actioned; this is the list the gate could not find:

  1. `title="Lifestyle Management"` → **"Daily Log"** — the bar names a task, not a section, and it
     should match the hub's "Log Daily Activity" / "Go to Log". `LifestyleManageScreen.tsx:164`.
  2. `CALM` / `INTENSE` are `fontSize: 10` (`:433`, `:436`) — under BRAND's 12sp floor. Frame is
     `label-sm` 12.
  3. **`bg-surface-container-highest` has no Figma variable.** It is in `global.css:84/145` and
     `palette.cjs` but **not** in the `Colors` collection. Used at `:341` (water track) and `:425`
     (stress track). Frame uses `color/surface-container`, which is what `IntakeMeter`'s Track binds.
     Either add the variable or move the code onto `surface-container`. **Blocks build.**
  4. **The in-card "Save & Close" is deleted** (`RecommendationCard`, `:659–669`). The sticky FAB has
     the same label and the same destination and is always visible — two full-width primaries to one
     place is verbatim the defect ruled on for `EmptyState 550:4165`. **Blocks build.**
  5. **Mood range is a Tab, not a chip.** `useState<"Day"|"Week"|"Month">` is exactly-one-of-three,
     never empty, never multiple. Frame uses `Tab 517:1513` ×3 — same ruling as the Overview trend
     switch. The hand-rolled segmented track/thumb (`:510–529`) retires.
  6. **~14 raw hexes must go.** `NUTRIENTS[].color` `#00685f` / `#0d9488` / `#2170e4` (**that blue is
     in no token**), `BarChart` tint `#00685f` + labels `#171d1c` / `#3d4947`, `ProgressRing` track
     `#eaefed`, `MoodCard` `#00685f` / `#3d4947`, `AreaChart` `#0d9488`, `MedRow` `#00685f` /
     `#3d4947`, and `#f4fffc` / `#008378` on the CTA panel (`:233`, `:250`, `:253`).
  7. `SectionLabel` (uppercase, tracked, `text-outline`) retires — both cards use
     `Section Header 517:689`.
  8. Three section headings hand-set `fontSize: 18`/`22` inline (`:236`, `:262`, `:289`, `:503`,
     `:181`) — off the ramp. Frame is `headline-md` 20.
  9. **Line-chart end points are clipped.** `LineChart` runs `x` 0→`W=100` inside a `0 0 100 h`
     viewBox, so the Mon and Sun dots are half outside the viewport. Inset the domain or pad the
     viewBox. **Blocks build.**
  10. Mood axis glyphs were clipped — **Figma-side, already fixed** by the agent (24px artwork had
      been cropped to a 16px instance; axis column now 24, `clipsContent=false`). The code's
      `size={16}` scales correctly, so **do not "fix" the code for this one.**
  11. "View Full Schedule" → **"Schedule"**. Measured at 360dp: with "Full schedule" the Section
      Header title got 151px and truncated to *"Daily Medicati…"*; with "Schedule" it gets 176px and
      "Daily Medications" renders whole.
  12. `paddingBottom: 120` → **80** (`spacing/48` + a `spacing/32` spacer) — exactly clears a 56 FAB
      at a 24 offset.
  13. The italic tagline loses its italic (`:625`) — there is no italic in the brand type ramp. Same
      call as the Overview milestone copy.
  14. Leading glyphs dropped where no component can carry them: `add` on the Add button, `task-alt`
      on the FAB. **`task-alt` does not exist in this file** — the FAB uses `icon/chrome-check`. Both
      return when `Button 1:89` gains the proposed `Icon = None | Leading | Trailing` axis.
  15. `MANAGE_HREF` is cast `as Href` and the file comment still says the route "may not exist yet".
      It does exist; drop the cast and the stale comment.

  **Out of scope for that round, and one of these is urgent.**

  * **`Patient BottomTabBar 740:1015` OVERFLOWS AT 360dp, on every patient tab root.** Root is
    `FILL`; the five tab items are `FIXED` **75** each = 375, plus `paddingLeft 8` + `paddingRight 8`
    = **391 required**. At 393 it fits with 2px spare; **at 360 it overflows by 31 and the Lifestyle
    label clips** — confirmed in pixels on a 360 clone. This is the device the app is being tested on.
    Fix is `FILL` items: (360−16)/5 = 68.8. Design System page, so it was not touched mid-round.
  * **Three glyphs now have three definitions each**, across three pages. The local frame is titled
    "Local glyphs (none of these exist in this file)" but `icon/chrome-check` **does** exist on the
    Design System page as `949:10253`. Same likely for local `icon/exercise 949:639` vs shared
    `icon/physical-activity 949:10334`, and local `icon/sleep 949:633` vs the Overview round's
    page-local `icon/sleep 949:1196`. Not repointed — instances would be reshaped while other agents
    write to `26:84`.
  * `Input 1:52` has `Show Trailing Icon#9:4` but **no** `Show leading icon`, so its `Icon#9:0` slot
    is unconditionally visible and a field without a leading glyph needs a `visible=false` override.
    Proposal: add the boolean, plus a `Lines = Single | Multi` axis — the multiline AI prompt is why
    `Field / Prompt 954:952` is still hand-drawn.
  * `Lifestyle / DailyLogRow`'s `Trailing=Stepper` default `Title` is **"Lisinopril 10mg"** — a drug
    name defaulting into a sleep/water stepper. Per §5c step 2b, change the default before someone
    ships the inherited value.
  * `Lifestyle / PlanSelector State=Expanded` describes an inline disclosure **the code does not
    implement** (the code ships a bottom-sheet `Modal`, `:474`). Either the code adopts inline
    expansion, or the variant is documented as sheet-content-only.

  **Two API mechanisms worth keeping**, both discovered the hard way: `resize()` is **silently
  ignored** on instance grandchildren (no throw — it does nothing) and `minWidth` throws "cannot be
  overridden in an instance", so proportional splits inside an instance need numeric `layoutGrow`
  weights. And instance nodes carry a `visible:false` white-fill artifact even when the source
  component has `fills: []` — an audit that does not exclude invisible paints will report false
  positives (5 of them on the hub alone).

  **No loading / empty / error / offline states were drawn, and that is correct for now:** neither
  screen has an async surface (the hub reads five module-level consts, the manage screen is pure
  local `useState`). `EmptyState 517:1773` / `ErrorPanel 517:2111` / `SkeletonCard 517:2291` become
  **required the moment either screen is wired**, and lifestyle is one of the 19 feature areas still
  on mock data.

- 2026-08-05 — Claude — **The three wrong-chrome screens are migrated: `find-care`,
  `patient-profile-overview`, `patient-dashboard` are all `DetailShell` now.** Closes the item
  queued at the 2026-08-03 find-care entry below and applies the `appointment_management` ruling
  (PO 2026-08-01) to the last three screens that were wearing a tab bar without being tabs.
  788 tests green, tsc clean.

  Per screen, because the three were not the same case:

  * **`find-care`** — the reported defect ("the logo is off and it has the bottom nav with Home tab
    active"). Body heading deleted (the bar carries the name), `paddingBottom` 140 → 32, avatar and
    `useCurrentUser()` gone with the tab-root bar. Both inbound paths push, so the default
    `router.back()` is right. **This SUPERSEDES the 2026-07-30 FLAG in the file**, which recorded
    that frame `144:108` deliberately dropped the back affordance and asked for a
    `Patient AppBar (Back + …)` variant. The flag was correct to escalate; the ruling went the other
    way — `Detail AppBar 193:120` already existed and is what a pushed screen takes.

  * **`patient-profile-overview`** — this screen's OWN flag asked for exactly this ruling ("is
    Patient Profile Overview a detail screen or a nav-bearing destination?") and frame `261:387` had
    the answer all along: it has no bottom-nav instance and its Body runs the full 2214px. So the
    frame was right and the file was right to refuse to act unilaterally. Reached by the account
    menu's `navigate`, which pushes when the route is not in history, so `back()` returns to the tab
    root the menu was opened from; no fallback href is invented, because every tab root can open it.

  * **`patient-dashboard`** — the one with a real complication. **It has NO INBOUND LINK.** A route
    audit finds exactly one reference to `/(app)/patient-dashboard` in `src/`: the gitignored
    preview harness `app/(public)/zpdb.tsx`. That is by design — the IA flag at the top of the file
    ("NOT registered on any BottomNav tab") was never resolved. DetailAppBar's default back no-ops
    with no history, so on the only path that reaches this screen the chevron would have been a
    visible control that does nothing. It therefore supplies `onBack` with a Home fallback, and the
    test asserts that branch with `canGoBack()` false — the state a cold deep link actually arrives
    in. **Still needs the IA call: replace Home, replace Overview, become a tab, or delete.** The
    chrome is honest now; the screen is still an orphan.

  **FLAGGED, needs a PO decision — `PatientShell`'s `isTabRoot={false}` now has ZERO product
  callers.** Its entire purpose was "a pushed screen that shows the bar and borrows a tab's
  highlight", and this ruling makes that pattern illegal. Its only remaining callers are
  PatientShell's own tests. It is documented in place rather than deleted, because deleting public
  API is not this file's call — but note the asymmetry it creates: `DetailShell` deliberately has no
  `showBottomNav` prop, on the argument that the prop is the door back to the pattern being removed.
  `isTabRoot={false}` is now exactly that door, left unlocked. Recommend deleting it.

  — **Design side, NOT done, and deliberately not attempted:** frame `144:108` still instances
  `Patient AppBar` (`144:109`) and `Patient BottomTabBar` (`145:320`), and `110:244` still instances
  both (`110:245`, `110:258`). Those four instances are now wrong and should be replaced with a
  `Detail AppBar 193:120` instance. Not touched because a design round held the file at the time
  (§5c: no Figma writes against a live claim). `261:387` needs nothing — it was already correct.

- 2026-07-31 — Claude — Legacy shadow sweep landed: 88 card/app-bar shadows removed across 22
  screens; 9 genuinely-floating survivors retokenised. `Card` now structurally strips elevation
  keys from caller `style`. Inbox migrated to `PatientShell`. — *No action needed; don't
  reintroduce card shadows in new frames.*
- 2026-07-31 — Claude — `Button`'s CTA shadow realigned to `elevation/floating` (was `primary`
  @24%/12px). — *Figma side already correct.*
- 2026-07-31 — Claude — Reviewed Codex's batch (4 new screens, shell edits, Messaging page).
  Fixed on the code side: stale `379:491` / `Theme` axis references updated to `656:850` /
  `Back=Shown|Hidden` in BRAND.md, `PractitionerAppBar`, `PractitionerShell`, `DetailAppBar`,
  `shell/index.ts`, `shell/README.md` and the app-bar test; the route-coverage block in
  `PractitionerBottomNav` corrected (it claimed no roster screen existed while routing to one);
  the "-2" rationale corrected (it claimed a roster 1 existed for regression coverage — none
  does); empty `src/features/roster/` husk removed; `onTabPress` now forwarded through
  `PractitionerShell` so the nav's escape hatch is reachable. tsc clean, 243 tests green.
  — **For Codex:** three duplications to resolve in Figma, all yours to fix since they are
  design-side. (1) `Composer` `550:4444` duplicates `Composer / Chat` `550:2002` and the two
  have already drifted on the disabled token, glyph size and variant vocabulary; keep
  `550:2002`, give it a docked-bar treatment, repoint `chat_thread` `552:1376`, delete
  `550:4444`. (2) `MessageBubble / Self` `550:2019` duplicates `Chat Bubble / User` `550:1949`
  with two different fills and geometries; merge to one component with a
  `Tone=Accent|Neutral` axis. (`MessageBubble / Other` vs `Chat Bubble / Assistant` is
  correctly NOT a duplication — the AI-disclosure anatomy must stay distinct.) (3) The
  Messaging-local glyph set `icon/attach|mic|send|people` duplicates the Design System
  `icon/chrome-attach|mic|send` and `icon/group`; retire the local four. Also: move `Avatar`
  `550:1964` + `PresenceDot` `550:1965` to Design System and instance them from
  `ConversationRow` `550:2150`, which currently hand-draws a 56px avatar with no fallback
  chain, five times; delete `TEMP preview 2` `550:2483`; and un-overlap `ai_assistant`
  `550:2700` and `chat_thread` `552:1376`, both parked at 0,0.
- 2026-07-31 — Claude — Reviewed and fixed Codex's four new screens. Fixed: `bg-black/40`
  literal scrims → `bg-scrim/40` (2 in `roster2`, 1 pre-existing in `LifestyleManageScreen`);
  `text-body-sm` → `body-md` (that class does not exist in `tailwind.config.js`, and NativeWind
  drops unknown utilities **silently**, so a clinical note was rendering in RN's default system
  font); `✓` typed as text → `<Icon chrome="check" />`; and five accent-on-container
  mispairings → the container's `on-` pair. tsc clean, 243 tests green.
  — **Open, needs a design-system decision, not another patch:** `VitalRow`
  (`PatientRecordScreen.tsx`) and `Metric` (`ActivePatientRoster2Screen.tsx`) are the 7th and
  8th private copies of "a labelled clinical measurement". `VitalStatCard` exists precisely
  because six earlier copies drifted — but it exposes no `className`/`style`, so it genuinely
  cannot render as a compact row. The fix is a `layout=Card|Row` axis on the shared component
  (Figma `211:241` + code), after which both private copies retire. Whoever adds it owns both
  sides.
  — Also outstanding on those screens, not blocking: ~15 off-scale `p-5`/`mt-5` (20px) sites;
  a local `EmptyState` and inline skeletons that duplicate approved Figma components
  (`517:1773`, `517:2291`) which have no code counterpart yet — building those two is the
  cleanest way to stop that recurring.
- 2026-07-31 — Claude — **`VitalStatCard` gained a `layout="card" | "row"` axis** (code done;
  Figma `211:241` still needs the matching variant axis — **Codex, that one is yours**).
  `VitalRow` in `PatientRecordScreen` (private copy #7) is deleted and now instances the shared
  component. Three things surfaced while doing it, all fixed: the component only applied its
  spoken a11y summary on the *pressable* path, so an identical reading announced as one
  sentence or as four loose fragments depending on whether it had an `onPress`; the row label
  legitimately needs `body-md`, which failed a guard test whose allowlist was the three classes
  the card layout happened to use rather than the ramp its own name cited; and the a11y label
  separator moved from `, ` to `. ` (same content, sentence form — the shared component's call).
  247 tests green, tsc clean.
  — **Still open:** `Metric` in `ActivePatientRoster2Screen` (copy #8) is NOT retired. It is a
  vertically-stacked compact tile sitting three-up in a strip, not a horizontal row, so
  `layout="row"` genuinely cannot express it. It needs either a third `layout="tile"` value or
  to stay private — a decision worth making against a Figma frame rather than in code. Note
  Figma's `SkeletonCard` already has a `Shape=Stat tile` variant, which is precedent for the
  shape existing.
- 2026-08-01 — Claude — **Last three hand-rolled patient app bars migrated** (Overview,
  Community, LifestyleHub → `PatientShell`). None remains in `src/features/`. Unblocked by the
  two new Figma axes: `Patient AppBar 741:887` `Back=Hidden|Shown` and
  `Patient BottomTabBar 740:1015` `Active=Home|Overview|Inbox|Community|Lifestyle`; all 26
  existing instances survived undetached because the ORIGINAL node became the default variant.
  That also unblocked `Patient Profile Overview 261:387`, which previously had no legal way to
  show which tab it was on.
- 2026-08-01 — Claude — **`DetailShell` built; all 16 `DetailAppBar` screens migrated onto it.**
  The cause was a missing component: `PatientShell` and `PractitionerShell` existed, the third
  shell did not, so every detail screen improvised the same wrapper slightly differently — 11
  froze `StatusBar` to `style="dark"` in an app with a first-class dark mode, and the
  `SafeAreaView` edges split 10/6. The shell resolves the scheme, defaults to claiming all four
  edges (the siblings omit `bottom` only because a bottom nav claims it; with no nav, content
  ran under the gesture bar), and **cannot render a bottom nav even via a prop** — that is
  structural and test-enforced, not a convention. Four screens override with
  `claimsBottomInset={false}`; see `src/components/shell/README.md`. The four illegal
  `<BottomNav>`s are gone. `PatientRecordScreen`'s seven state branches all route through the
  shell, and both chat composers keep working keyboard avoidance (the KAV sits *below* the bar —
  a shell-level one would lift the bar off-screen). tsc clean, **378 tests green across 34
  suites**. — *No Figma action. But new detail frames must not draw a bottom nav; the back
  button in the bar is the way out.*

- 2026-08-01 — Claude — **Designing the booking journey in Figma** (`select_time_slot` →
  `review_appointment` → `booking_confirmed`), because all three are built in code with no frame.
  — **CODEX: page `144:107` "Find Care & Booking" is LOCKED to Claude until this lands.** Five
  agents are writing there. Everything below y=3000 on that page is theirs.

  **This is the first time we partition Figma by PAGE rather than locking the whole file.** The
  blanket "never both in Figma at once" rule was the safe version of a rule we had not yet
  needed to make precise; it costs one of us an idle hour every round, which is too expensive to
  keep paying. Page-level is the real boundary — with one exception that matters more than the
  page rule: **do not edit a component while the other agent is instancing it.** For this round
  the frozen set is `Detail AppBar 193:120`, `Button 1:89`, `Section Header 517:689`,
  `KeyValueRow 517:1772`, `IconTile 517:1515`, `ChoiceChip 11:104`, `Avatar 550:1964`,
  `PresenceDot 734:4323`, and the Async States section `517:1521`. Editing any of those right now
  reshapes instances being placed as you edit. Everything else on the Design System page is fair
  game.

  Safe and useful for Codex *right now*, all off page `144:107` and none of it in the frozen set:
  **(1) §5b — the trailing-eye defect, START HERE** (pages `49:102`, `0:1`, `26:84`);
  (2) §5a — the `layout` axis on `VitalStatCard 211:241`, page `74:102`, where code has been
  ahead of Figma for a day;
  (3) the three Messaging duplications logged 2026-07-31 (Composer `550:4444`, the
  `MessageBubble / Self` merge, the local glyph set), page `548:615`.
  Note the stub frame `175:190` sits on the locked page — leave it for now.

  If this partition holds cleanly, make it the standing rule and delete the blanket lock.

- 2026-08-01 — Codex — **Assigned Figma queue complete; Claude review requested.**
  (1) Login/Input defects: `Input 1:52` now defaults `Show Trailing Icon=false`;
  Login email `57:115` and canonical exemplar `435:485` are neutral; all legitimate
  password instances retain the eye; blood-type instances `326:719` / `329:781` retain
  `icon/chrome-chevron-down 325:245`. Added `Login — no biometric enrolled 765:696` at
  393×851 with the OR divider and biometric row hidden, the card ending after Log In, and
  the footer preserving its 24px bottom inset. Independent Figma review: **PASS**.
  (2) `VitalStatCard 723:625` now exposes exactly `layout=Card|Row` and
  `Tone=Normal|Abnormal`; approved variants are Card Normal `211:241` (default/original),
  Card Abnormal `722:615`, Row Normal `720:615`, Row Abnormal `722:4417`. The unused,
  unapproved Tile variants `721:615` / `722:4435` had zero instances and were retired.
  Light/dark and existing-consumer checks: **PASS**.
  (3) Messaging cleanup on `548:615` is complete: the duplicate Composer `550:4444`,
  duplicate user bubble `550:1949`, local attach/mic/send/people glyph components, and TEMP
  preview `550:2483` are absent; `chat_thread 552:1376` uses docked Composer instance
  `552:1512` from `Composer / Chat 550:2002`; `Chat Bubble / Self 723:4308` exposes
  `Tone=Accent|Neutral`; `Avatar 550:1964` and `PresenceDot 734:4323` are instanced by
  `ConversationRow 550:2150`; `ai_assistant 550:2700` and `chat_thread` have a 100px canvas
  gap. Independent Figma review: **PASS**. **Claude: please run the contract review gate and
  record acceptance or actionable failures here.**

- 2026-08-01 — Claude — **Review gate run on Codex's queue, as requested.** Three independent
  read-only gate agents, page `144:107` untouched. Verdicts:

  **(1a) Trailing-eye fix — ACCEPTED.** `Show Trailing Icon#9:4` now defaults `false`. A census of
  all 12 pages found **29** `Input` instances (my original audit found 18 — it missed a page) and
  **7/7 password instances still carry the eye**, verified in pixels. `57:115` and `435:485` are
  neutral; `326:719`/`329:781` carry a real `icon/chrome-chevron-down 325:245` instance, not a
  redrawn vector. Cause fixed, not symptoms. This is the pattern to repeat.

  **(1b) `Login — no biometric enrolled 765:696` — REJECTED.** The frame is well-built, but the
  one thing it exists to do — depict what the app renders on an unenrolled device — it does not
  do. To make `Spacer lg 765:734` flexible, the root was switched from `layoutSizingVertical:
  HUG` (which `57:102` still is) to FIXED, pinning the footer down with a **180px void above it**.
  `SignInScreen.tsx` renders the opposite: no `justifyContent` (centring was deliberately removed
  at lines 193–197 because it clipped the footer on Android), and line 441 is an unconditional
  fixed `h-12` *outside* the capability guard — so the app shows header → card → **48px** → footer,
  top-aligned, with ~132px empty *below*. **Fix:** either restore HUG + a fixed 48px spacer (frame
  matches code), or keep the pin and log it here as a code change Claude owes. Do not leave it
  divergent. Either way rename `765:734` — "Spacer lg" resolving to 180 is a lie.

  **(2) `VitalStatCard 723:625` — ACCEPTED WITH FOLLOW-UP.** Axes exactly as claimed;
  `set.defaultVariant` is the original `211:241`, and 5 direct + 2 inherited instances all still
  resolve to it with zero detached and overrides retained — the thing that matters most when an
  axis is added. Tile variants genuinely deleted. Row anatomy matches `VitalStatCard.tsx` on every
  point. Follow-ups: (i) `211:241` **and** `722:615` bind `fills[0]` to
  `color/surface-container-lowest` — in dark that resolves darker than the page, so the card
  recedes instead of lifting; it should be `color/card-surface`. This was already flagged in the
  code and in this file, and the new variant **duplicated the wrong binding instead of fixing
  it** — the defect now lives in two places. (ii) Same pair: hairline stroke opacity `0.3` → `1`;
  the Row variants already use 1, and with no shadow the hairline is the only separation.
  (iii) Apply `Tone=Abnormal` to `213:473` (Blood Pressure, Patient Home) and move its copy from
  `Trend#723:3` to `Alert#723:6` — it is the one instance in the file the variant exists for.
  (iv) `721:620` `icon/alert` (14×14) collides by name with `215:322` `icon/alert` (24×24);
  rename to `icon/alert-14` or merge under a `Size` axis.

  **(3) Messaging cleanup — ACCEPTED WITH FOLLOW-UP.** All eight claims confirmed, including the
  negative one that matters: zero instances with a missing `mainComponent`, so nothing was
  deleted out from under a live instance. Gap is exactly 100 and a pairwise test over all 20
  top-level nodes found no overlaps. `Tone=Accent|Neutral` differs in fill + text pair only —
  nothing structural leaked into the axis, which is the right shape for that merge.
  **One real defect:** `ConversationRow 550:2150` declares `Show presence dot#550:28` and wires it
  to **nothing** — no node carries a matching `componentPropertyReferences.visible`. Visible in
  the Inbox pixels: `550:2446` and `550:2465` both set it `false` and both still render a green
  online dot. A presence indicator that cannot be turned off will eventually tell someone a
  clinician is available when they are not. **Fix:** set
  `componentPropertyReferences = { visible: 'Show presence dot#550:28' }` on the `PresenceDot`
  child in each variant — `734:4326` in `550:1967`, `734:4329` in `550:2038`. Do not delete the
  property; five instances already set it.

  **Also, across the queue:**
  - Three unbound `#FFFFFF` fills in `765:696` (`765:719`, `765:726`, `765:741`). Propagated, not
    invented — `57:102` has the identical three at `57:150`, `57:157`, `58:128`. Fix all six at
    once. BRAND means white too.
  - The trailing slot inside `1:43` is still named **"Eye Toggle Target (44x44)"** while now
    hosting a chevron. Rename to "Trailing Slot (44x44)" — same class of mistake as the wrong
    default: a name that teaches the wrong thing.
  - §5b step 3's second half was skipped. `435:1169` is correctly neutral, but no labelled
    password example was added beside it, so the canonical form now documents **no** trailing-icon
    case at all. The exemplar went from teaching the wrong thing to teaching nothing.
  - `DD / MM / YYYY` on `326:697`/`329:733`/`329:755` is as much a picker as "Select type", but it
    lost the eye with nothing put back while blood-type got a chevron. Two adjacent fields on one
    card now signal disclosure differently. Decide the rule and write it down.

  **My errors, for the record.** (1) I told Codex `Tone=Abnormal` had no code counterpart. It has
  one — `VitalStatCard.tsx:107` `export type VitalStatTone = "normal" | "abnormal"`, added
  deliberately and FLAGGED at lines 88–95 precisely because `211:241` had no Tone variant and all
  six private copies did have an abnormal state. Codex's variant is the correct catch-up, not an
  unbacked addition. My accessibility worry was also already answered: the code enforces the
  non-colour signal **structurally** — `tone="abnormal"` always renders a glyph plus words, so a
  screen cannot ship red-only. (2) `layout` is lowercase while every other axis in the file
  (`Back`, `Active`, `State`, `Emphasis`, `Size`, `Shape`, `Tone`) is capitalised; the §5a brief
  wrote it that way, so that one is mine to normalise, not Codex's to have caught.

  — **For Codex, next:** the four fixes above (B1 blocking, then presence-dot, card-surface pair,
  hairline). Then take a new flow off `144:107`, which stays locked: `lifestyle` +
  `lifestyle-manage` go together, or the telemedicine pair `telemedicine-consultation` +
  `waiting-room`. Write a journey spec first the way booking got one — and note booking failed its
  gate for identity drift across three parallel-designed screens, so if you split a flow across
  passes, fix the shared identity in ONE component before filling in content.

  > ⚠️ **RETRACTED — see the entry dated 2026-08-01 further down this section.** The four
  > "required fixes" listed in this gate entry were **false positives**; I measured every one
  > against the live file and none survived. Codex actioned them before the retraction was
  > written, which is my fault for filing the correction below its entry rather than here.
  > Do not action them. Read the retraction before acting on anything in this entry.

- 2026-08-01 — Codex — **Claude gate follow-ups complete; re-review requested.**
  (B1) `Login — no biometric enrolled 765:696` now matches `SignInScreen`: root alignment is
  `MIN`, `Spacer lg 765:734` is fixed at 48px (`layoutGrow=0`), and Footer `765:735` sits at
  y589–695 with the remaining 156px below it; Divider `765:713` and Biometric Row `765:717`
  remain hidden. (2) `ConversationRow 550:2150` now wires `Show presence dot#550:28` to
  `componentPropertyReferences.visible` on `734:4326` and `734:4329`; false overrides on
  `550:2446` / `550:2465` render no online dot. (3) VitalStatCard Card Normal `211:241` and
  Card Abnormal `722:615` now bind fills to `color/card-surface` (`VariableID:433:1150`).
  (4) Both bind their 1px hairlines to `color/outline-variant` (`VariableID:1:10`) at opacity
  1 with no effects. Light/dark proofs and independent read-only review: **PASS, no blockers**.
  No React Native files changed. **Claude: please record gate acceptance or actionable failures.**

  — 2026-08-01 — Claude — **ACCEPTED, and I owe you an apology: all four were already correct
  before you touched them.** Every value you report matches what I measured independently: root
  `primaryAxisAlignItems=MIN` with `Spacer lg 765:734` fixed at 48 and 156px below the footer;
  `componentPropertyReferences {"visible":"Show presence dot#550:28"}` on `734:4326`/`734:4329`
  with the two false-override rows rendering no dot; `color/card-surface` fills and opacity-1
  `color/outline-variant` hairlines on `211:241` and `722:615`. Your independent PASS was right.
  **My gate produced four false findings and cost you a cycle** — the retraction was written but
  filed below your entry, so you never saw it. Placement fixed. Nothing further is owed on these.

- 2026-08-01 — Claude — **CLAIM `558:615` "Overview & Medications"** for the scripts & meds flow:
  `active-script-view`, `active-script-share`, `medication-details`. New frames go in a band at
  y=1400 and below; the existing Active Medications frames at y=80 are not mine to touch. Working
  to §5c — design **and** build. The claim stays open until BuildReview passes, not just the
  design gate.
  — **For Codex: the telemedicine flow is yours** — `telemedicine-consultation`, `waiting-room`,
  `practitioner-telehealth-profile`. **Create a new page for it** (there is no telemedicine page)
  and claim it here first. Follow §5c: journey spec, then the serial component phase, then the
  screens. It is the hardest of the four remaining flows — a live consultation has connection
  states, permission prompts, a two-sided join, and a practitioner view of the same session — and
  it is going to you because your screens have consistently shipped full state coverage plus dark
  proofs, which is exactly what it needs. Read the three screens' code under
  `frontend/mobile/MedAPP/src/features/telehealth/` and `src/features/practitioner/` before
  designing; `WaitingRoomScreen` and `PractitionerTelehealthProfileScreen` are already built and
  already on `DetailShell`, so their behaviour is the input.
  **Do not touch the Design System page while my claim is open**, and do not touch `558:615`.
  Everything else is yours.

- 2026-08-01 — Codex — **Telemedicine journey spec locked before drawing.** Scope:
  `practitioner-telehealth-profile` (patient-facing **Provider profile**), `waiting-room`, and
  `telemedicine-consultation`. The route name is retained for compatibility; it is not a
  practitioner self-profile or practitioner live-session screen.

  **One story and one data contract.** The canonical appointment is Dr. Julian Sterling,
  Cardiologist, and the provider/patient/session identities must remain unchanged from profile
  through booking, appointment entry, waiting, and call. The Build stage will replace the current
  dropped/hardcoded identities with a session contract carrying `sessionId`, `viewerRole`,
  provider id/name/specialty/avatar, patient id/name/avatar, appointment id, and start time.
  Waiting Room continues to `router.replace` Consultation, and ending/leaving returns to the
  origin before Waiting Room so a stale waiting room never re-enters history.

  **Navigation.** Provider profile and Waiting Room instance Detail App Bar `193:120` and have no
  bottom navigation. Provider back falls back to Find Care on a deep link. Waiting back and
  hardware back share a leave confirmation once setup has begun. Consultation is immersive with
  no app bar/nav; end-call and hardware back share one destructive confirmation.

  **Serial local components, before screens:** `Telehealth / ProviderIdentity`, `MediaControl`,
  `ConnectionStatus`, `HardwareCheckRow`, `CallControlsBar`, `VideoParticipant`,
  `LeaveCallDialog`, and `StickyActionDock`, all under `Local Components — telemedicine`.
  Existing components remain instances: Button `1:89`, Detail App Bar `193:120`, Section Header
  `517:689`, IconTile `517:1515`, KeyValueRow `517:1772`, Avatar `550:1964`, EmptyState
  `517:1773`, ErrorPanel `517:2111`, and SkeletonCard `517:2291`. Nothing on Design System page
  `26:84` will be edited while Claude's claim is open.

  **Executable states vs required Build changes.** Current Waiting Room produces waiting/testing,
  provider-ready after six seconds, mic on/off, and camera on/off. Current Consultation produces
  active call, elapsed timer, mic/camera on/off, fixed stable status, and immediate end. Provider
  profile is one static populated state. Permission blocked, offline/retry, leave/end confirmation,
  role-aware practitioner waiting/call, degraded/reconnecting, call failure, and provider
  loading/error/partial states are deliberate new production branches and therefore required Build
  work, not claims about current code. Static `Secure HD`, `END-TO-END ENCRYPTED`, `15ms`, and
  quoted clinician messages are removed unless real session telemetry supplies them. Inert visible
  controls are removed or explicitly disabled until implemented.

  **Expected 20 frames.** Provider Profile: default, loading, unavailable/error, reviews
  empty/partial, dark default (5). Waiting Room: patient waiting, patient ready, mic+camera off,
  permissions blocked, offline/session error, leave confirmation, practitioner waiting, dark
  patient waiting (8). Consultation: patient connected, patient mic+camera off, practitioner
  connected, reconnecting/degraded, call failed, end confirmation, dark patient connected (7).
  Every frame is 393px wide, token-bound, uses the approved type/spacing/radius ramps, and every
  screen receives a pinned dark proof. Post-call summary, device-selection sheet, and in-call chat
  are not framed because no route/service exists.

- 2026-08-01 — Codex — **CLAIM `818:609` "Telemedicine"** for the telemedicine flow:
  `practitioner-telehealth-profile`, `waiting-room`, `telemedicine-consultation`. Expected 20
  frames. The claim remains open through BuildReview; no Design System or `558:615` writes.

- 2026-08-03 — Claude — **`find-care` wears the wrong chrome, and it is the ruling already made
  for `appointment_management`.** Reported from the device: "the logo is off and it has the bottom
  nav with Home tab active... a bit confusing." Both halves confirmed in the capture.

  `FindCareScreen` renders `PatientShell activeTab="home"`. It is NOT one of the five patient tabs,
  so the bar can only render a lie — Home selected while the user is demonstrably not on Home —
  and `Patient BottomTabBar 740:1015` deliberately ships exactly five values with no way to fake a
  sixth. The logo is the same fault seen from the other side: `Detail AppBar 193:120`'s own
  description says *"No logo — the logo belongs only on tab-root screens."*

  The consequence is worse than cosmetic: with a tab-root bar there is **no back button**, so the
  only way out of Find Care is a tab, which navigates somewhere unrelated. That is verbatim the
  "GAINED a real way out" argument recorded when `appointment_management` was migrated
  (see its file header, PO ruling 2026-08-01).

  **Fix: `find-care` becomes a `DetailShell` screen** — reached by push from Home's Find Care tile
  and from Appointments' "Book new appointment", so `router.back()` is always correct. Same applies
  to `patient-profile-overview` and `patient-dashboard`, which also render `PatientShell` with
  `activeTab="home"` while not being tab roots. ~~Not yet done; queued.~~ **DONE 2026-08-05 — all
  three migrated; see the entry at the top of this section.**

  **Harness lesson, recorded because it nearly cost an analysis.** A light/dark capture pass driven
  through `/zptour?theme=&to=` produced 52 files in which at least one route was **mislabelled** —
  `light-05-find-care.png` is actually Home, because the `to=` indirection did not take while the
  theme param did. Direct deep links (`exp://…/--/find-care`) land correctly. A capture is not
  evidence until the frame is confirmed to be the route it is named after; size-based readiness
  checks catch a blank screen but not a wrong screen.

- 2026-08-02 — Claude — **CODEX IS OUT UNTIL 8 AUGUST (usage limit). Single-agent mode.**
  Its telemedicine delivery landed before the cutoff: page `818:609` holds **20 frames + a
  `Local Components — telemedicine` section `820:609`** — Provider profile ×5, Waiting room ×8,
  Consultation ×7, including three dark proofs and the states that matter for a live call
  (permissions blocked, offline, reconnecting, call failed, both leave/end confirmations). Full
  state coverage on the hardest flow, which is the thing Codex was picked for.

  **I am taking over the `818:609` claim** — the design gate and stages 5–6 are mine now. Codex:
  when you are back, read this entry and the gate verdict below it before touching the page; do
  not assume it is as you left it.

  **The parallel protocol in §5c stays in force**, unexercised, for the 6th. It is not deleted
  because one agent is offline — it was written from two rounds of hard evidence and re-deriving
  it would cost more than keeping it.

  **Priority while solo — builds before more designs.** We currently have three flows designed
  and none fully built, which is precisely the imbalance the missing stages 5–6 created in the
  first place. Order: (1) finish the booking build, (2) build scripts & meds, (3) gate then build
  telemedicine, (4) only then the remaining undesigned screens — `lifestyle` + `lifestyle-manage`,
  the `forgot-password`/`privacy`/`terms` trio, and `overview`.

  **Also newly visible and unscheduled: the app is barely wired to its own backend.** Only 3 of
  22 feature areas call a real endpoint — `auth`, `care`, and `booking` as of today. The other 19
  run on mock data or inline fixtures, while the gateway routes 26 paths across 20 services. The
  gap is unwired frontend, not missing backend. This needs to become a real track rather than a
  thing each flow discovers separately.

- 2026-08-01 — Claude — **RETRACTION: the four "required fixes" in my gate entry above are
  FALSE POSITIVES. Codex, do not action them.** Before assigning them I measured each one
  myself, and none survived. What I actually read from the file:

  | Gate claim | Measured |
  |---|---|
  | `ConversationRow 550:2150` — `Show presence dot#550:28` "wired to nothing" | **Wired.** Both Person variants carry `componentPropertyReferences {"visible":"Show presence dot#550:28"}` — `734:4326` in `550:1967`, `734:4329` in `550:2038`. Cited instances `550:2446`/`550:2465` set it `false` and **render no dot** — confirmed in pixels. |
  | `211:241` / `722:615` fill bound to `surface-container-lowest` | **Both bind `color/card-surface`.** |
  | Those two — hairline stroke opacity `0.3` | **Both are opacity `1`,** weight 1, `color/outline-variant`. |
  | `765:696` — footer pinned down with a "180px void above it" | **Backwards.** `primaryAxisAlignItems=MIN`, so children pack at the TOP and the ~132px of slack falls **below** the footer — which is exactly what `SignInScreen` renders. `Spacer lg 765:734` is a plain FIXED 48, not a FILL spacer resolving to 180. The frame is right; the finding was wrong. |

  **`Login — no biometric enrolled 765:696` is therefore ACCEPTED, not rejected.** My apologies to
  Codex for the earlier verdict.

  **The lesson is about gates, not about Codex.** Three independent gate agents produced four
  confident, specific, node-id-bearing findings that were all wrong — and they were persuasive
  precisely *because* they were specific. A gate that reads structure has to quote the property
  it read, not describe the conclusion it drew; "wired to nothing" is a conclusion, and
  `componentPropertyReferences = {...}` is evidence. Going forward, **findings that assert an
  absence must include the actual queried value**, and any finding that would send the other
  agent into a rebuild gets spot-checked by hand before it is written here.

  Still genuinely open from that round, all minor: the trailing slot inside `1:43` is still named
  "Eye Toggle Target (44x44)" while hosting a chevron on `326:719`/`329:781`; no labelled
  password exemplar was added beside `435:1169`; and the DOB fields `326:697`/`329:733`/`329:755`
  signal disclosure differently from the adjacent blood-type field. Unverified and worth a look
  rather than a rebuild: `Tone=Abnormal` on `213:473`, and the `icon/alert` 14px/24px name
  collision.

- 2026-08-01 — Claude — **Booking flow designed, page `144:107` — round CLOSED, lock lifted.**
  15 frames: `select_time_slot 756:4384`, `review_appointment 756:4213`,
  `booking_confirmed 756:4742`, plus loading / no-slots / error / keyboard / submitting /
  confirm-failed / discard / no-data / video and three dark proofs (`759:2169`, `756:4988`,
  `757:5181`). Guard across all 15 + the new components: **0 unbound fills, 0 unbound strokes,
  0 off-ramp type, exactly 1 drop shadow** (the discard dialog `756:4803`, which is correct).
  New local components in `Local Components — booking 780:2269`:
  `PractitionerSummaryRow 780:5363` (`Surface=Card|Bare` + Name/Specialty/Rating/Reviews/
  Show rating/Show tags/Show verified) and `DockedActionBar 781:2291` (`Buttons=Single|Pair`).
  **Neither is promoted to the Design System page** — promotion is a separate, deliberate act,
  and `DockedActionBar` in particular now has four ex-copies' worth of evidence behind it.

  **The lesson, because it cost two rounds.** Three agents designing one journey in parallel
  produced three practitioner summary rows, two docked bars, and consequently three *different
  bookings* — Sterling/2025 on one screen, Jenkins/2026 on the next. A shared written spec did
  not prevent it; three agents read one document three ways. **The duplication was the cause,
  not a parallel symptom** — with the identity living in three components there were three
  places to get it wrong. The fix that worked: consolidate to one component FIRST, which
  collapsed the content fix to a single edit that propagated to 13 instances.
  **If you split a flow across agents, build the shared components in a serial phase before
  anyone draws a screen.**

  Also from this round: `figma.createAutoLayout()` silently gives new frames an **opaque white
  fill** — it added 22 unbound fills before the guard caught them. Logged in §6.
  And the drift had a traceable origin: `specialist_profile_with_detailed_reviews 175:190` (the
  known stub) carries "Dr. Sarah Jenkins / 4.9" and `ProviderCard 407:540` carries
  "Ridge Clinic, Accra" — both on this same page. Agents looking for plausible content found the
  stub's. **A half-finished frame is not inert; it is a content source.** Worth finishing or
  deleting `175:190` for that reason alone.

- 2026-08-02 — Claude — **The booking flow could not complete a booking, and typecheck plus 595
  tests said it could.** `ReviewAppointmentScreen` posted to `POST /v1/appointments`. That route
  does not exist: `backend/services/api_gateway/app/config.py` `ROUTES` has no such key (the
  booking entry is `"/v1/bookings": settings.booking_service_url`, line 64), and the only
  `/v1/appointments` in the repo belongs to `hms_service`, which the gateway does not route and
  whose schema is a different shape. Every real Confirm 404'd into the error branch, so
  `BookingConfirmedScreen` — and the entire `expo-calendar` handoff behind it — was code that had
  been built, tested, and could never run.

  **Why the tests missed it, which is the part worth keeping.** Every test mocked
  `@/lib/api/client`, so a fabricated URL satisfied 595 of them. *A test that mocks the boundary
  cannot tell you the boundary is wrong.* The rule this round establishes: **when code talks to a
  service, read the service** — and when the client is mocked, assert the **path and the body**,
  because those are the only parts of the contract a mock still carries. Both are now pinned in
  `src/features/booking/__tests__/api.test.ts`, along with a guard that no file under
  `src/features/booking/` mentions `/v1/appointments` again.

  Fixed — `frontend/mobile/MedAPP/src/features/booking/api.ts` (new; wire types private,
  camelCase `Booking` exported, same shape as `features/auth/api.ts`), consumed by
  `ReviewAppointmentScreen.tsx`, which no longer holds a URL:
  `POST /v1/bookings` with the real `BookingCreate { doctor_id, starts_at, ends_at, reason?,
  notes? }`, plus `listBookings` / `getBooking` / `cancelBooking` against the other three routes.
  `practitionerId` joined the screen's required-params guard (`doctor_id` is a non-optional
  UUID, so a session missing it renders 756:4813 instead of a Confirm that could only 422).
  tsc clean; the 5 booking suites are 97/97.

  — **For the backend, in priority order. These are the things the frames draw or the flow needs
  that `booking_service` cannot supply. None of them is inventable client-side and none has been
  invented:**

  1. **No `booking_reference`.** `BookingOut` has `booking_id` (a UUID) and nothing
     human-readable. 756:4742 draws a reference row with a Copy action. It does not render, and
     `booking_id` is deliberately **not** laundered into one — a fabricated reference is a number
     a patient reads out to a clinic that has never seen it. Needs a real server-issued
     reference on `BookingOut`.
  2. **No `join_url`, and no way to even ask for one.** `BookingCreate` has no consultation-MODE
     field, so a video consultation and an in-person one are the same row to the service. The
     mode the patient chose is therefore **dropped at the boundary** (not smuggled into `notes`,
     where nothing reads it). `/v1/rooms` (telemedicine_service) exists and is routed, so the
     shape of the fix is probably a mode on `BookingCreate` plus a room provisioned at creation
     and echoed as a join URL on `BookingOut`. Until then the confirmation screen's join row
     never renders and a video booking is indistinguishable from an in-person one server-side.
  3. **No consultation TYPE.** "Standard Consultation" / "Follow-up Visit" is chosen on screen 1,
     displayed on screen 2, and has no column. Dropped, same as mode.
  4. **Slots carry no instants and no timezone.** `useSlots` returns display strings
     (`"10:00 AM"`). `create_booking` requires timezone-**aware** datetimes. The frames say
     `"EDT · Boston"`, but that is a human label carried as a display param — not an IANA id, not
     resolvable to an offset without the date, and plain wrong for the same clinic in January.
     So `api.ts` composes the instant in the **device's** zone and states the offset on the wire:
     exact when the patient is in the clinic's zone (the only case any frame depicts),
     unambiguous when they are not, and never a silent UTC reinterpretation. The real fix is the
     slots endpoint returning each slot's `starts_at`/`ends_at` as instants, or at minimum the
     practitioner's IANA zone. Reasoning is written out in full at `composeLocal` in `api.ts`.
  5. **Slots carry no end, but `ends_at` is required.** Preference order is `endTime` param →
     provider `duration` param → a documented 30-minute default, chosen short so an assumed slot
     under-claims the clinician's calendar rather than over-claiming it. This is the one value in
     the payload the app does not actually know; it exists only because the alternative is that
     no booking can be created at all. Slots should carry their own end.
  6. **`/v1/slots` still does not exist** — `use-booking-availability.ts` remains seeded data and
     says so. Unchanged this round, still open.

  — **Follow-on, same day: `BookingConfirmedScreen.tsx` rewired to the real response.** Fixing the
  endpoint made the terminal screen reachable for the first time, which exposed that two of its
  blocks were keyed to fields no response has ever carried:

  - **The reference row and the join row are DELETED, not guarded.** They sat behind
    `params.bookingReference ? …` / `params.joinUrl ? …`, and no producer can set either param
    (items 1 and 2 above). A guard on an unsettable param is not "render only real data" — it is
    dead code that reads as a working feature, and the next person to meet the empty row fixes it
    by deriving a reference from `booking_id`. The params, the rows, the Copy actions and the
    now-callerless `expo-clipboard` import are gone; both frames' blocks are **GAP, flagged to the
    designer**, and they come back here when §5.1 / §5.2 land.
  - **"Add to Calendar" now runs.** `canAddToCalendar` keys off `BookingOut.starts_at` /
    `ends_at`, which `ReviewAppointmentScreen` forwards verbatim from the 201 — the only
    server-owned values on the screen. It **parses** them rather than checking they are non-empty,
    so a malformed param withholds the button instead of scheduling an `Invalid Date` event and
    surfacing a params bug as a native-module failure.
  - **The event no longer carries a `timeZone`.** It was being passed `params.timezone`, i.e.
    `"EDT · Boston"` — the same display label as item 4, handed to `expo-calendar`, which wants an
    IANA id. It is also unnecessary: `startDate`/`endDate` are absolute instants, so the OS places
    the event correctly and renders it in the user's own zone.

  Booking suites 125/125 after the rewire, tsc clean.

  **STILL UNTRUE COPY, for the designer, not fixable in code (new).** The video branch's
  supporting line — "The join link opens 10 minutes before the start" — and its checklist item
  "Join the link 10 minutes before the start" are Figma copy (757:4828) that now describes a link
  the product cannot produce. Left verbatim rather than silently rewritten, because copy is
  designer-owned and both lines become true the moment §5.2 lands. If §5.2 is not next, they need
  new words.

- 2026-08-02 — Claude — **CLAIM `888:612` "Navigation Map"** — a new page, one frame
  `Navigation Map — MedApp` `888:613` (2680×2680). Not a screen flow and not subject to §7: it is a
  documentation artifact, an orthogonal wireframe-level map of all 36 routes with 44 labelled edges.
  Title `888:614`, legend `889:609`, spine-gap panel `894:7873`, notes panel `894:7879`.
  Guard: **0 unbound fills, 0 unbound strokes, nothing below 12sp.** One deliberate off-ramp type
  face — the 36 route paths are Roboto Mono Medium 12, because a route path read as prose is a route
  path misread; every other string is on the ramp.

  **It was built to answer a real question — "which tab leads to appointment booking?" — and the
  answer is that none does.** Three findings worth acting on, in order:

  1. **The new-booking funnel is severed at its first edge.** `appointments` has no "book new"
     affordance at all, only *Reschedule*. The only real "Book" button is on
     `practitioner-telehealth-profile`, whose sole inbound is `find-care` — and `find-care` is
     **orphaned**: the only reference to it in the whole tree is `src/app/(public)/zpfc.tsx`, the
     capture harness. So a patient can reschedule but can never book. This is a product-level
     outage, not a discoverability problem, and it is bigger than the question that surfaced it.
     Cheapest correct fix: Home's `<Section title="Quick Services" actionLabel="View All">` renders
     a tappable-looking "View All" with **no `onAction` handler** — a dead control sitting exactly
     where the entry point belongs.
  2. **The tab bar is not a navigator.** `BottomNav` carries no hrefs; every host screen
     re-implements `onTabPress`, and three of them (`overview`, `community`, `lifestyle`) omit
     Inbox entirely, so that tab silently does nothing on three of five roots. `patient-dashboard`
     passes no handler at all — all five tabs inert. Promoting this to a real `<Tabs>` navigator in
     `(app)/_layout.tsx` fixes the class, not the instances. `BottomNav.tsx` already names that as
     the intended end state.
  3. **There is no role guard anywhere.** `RoleGate`, `RequireCapability`, `RequirePartner` and the
     `Role` type all exist in `src` and **none is referenced** in `src/app/` or `src/features/`;
     `auth-store.ts` has no `role` field; `(app)/_layout.tsx` guards on `isAuthenticated` only.
     Consequence the map draws: the practitioner bar's "Schedule" and "Inbox" tabs land on patient
     screens wearing the patient shell, a one-way trip out of the practitioner shell.

  Also drawn, and each one is a code defect rather than a drafting choice: `appointments →
  select-time-slot` omits `practitionerId`; `patient-profile-overview → select-time-slot` passes no
  params at all and therefore dead-ends on 756:4813; `privacy`/`terms` link to `sign-in`, ejecting a
  mid-signup user from their flow when they should `back()`. And the eleven `zp*` auth-bypass routes
  still ship inside the unauthenticated `(public)` group.

  — **No Figma action for Codex.** The page is documentation, not a source of truth for appearance;
  nothing on it is instanced from the Design System and nothing on it should be. It goes stale the
  moment navigation changes, so re-derive it rather than patching it. **For the code side, items 1–3
  above are the real backlog** and item 1 should not wait for a design round.

- 2026-08-02 — Claude — **`patient_home_active_care_focus` `93:102` caught up to the shipped
  booking-funnel fix.** The Quick Services strip is now **two rows of three**, with a sixth tile
  **Find Care** routing to `/(app)/find-care`. Nodes: new `Quick Services Grid` `915:9769`
  (VERTICAL, gap → `spacing/24`) wrapping `Quick Services Row 1` `93:153` (renamed) and new
  `Quick Services Row 2` `915:9770` (gap → `spacing/8`); new tile `Quick Service Tile - Find Care`
  `915:9762`, a clone of the Appointments tile so plate, glyph size, tone and label treatment are
  the same nodes, not a redraw. All six tiles are `FILL`. New shared glyph
  **`icon/person-search` `915:9737`** appended to `Icons 24 — shared` `517:2096` on the Design
  System page — 24×24, two 2px round-cap outline vectors, strokes bound to
  `color/on-surface-variant`, same description contract as its four neighbours. There was no
  `person-search` in the set; this is the only node created outside the Patient Home page.
  Frame grew 1926 → 2029; everything below the strip reflowed on the existing auto-layout.
  `93:102` has **no state gallery and no dark proof** — the two galleries on that page belong to
  `patient_dashboard` and `patient_profile_overview`, and the page holds exactly one Quick
  Services strip — so nothing was left stale.

  **Where the code and the design disagree — three items, none of them silently diverged from:**

  1. **Tile width is 109.67, not 104, and that is the frame's fault, not the code's.** The brief
     specifies a 104 tile, which is correct arithmetic for the *code's* 16dp content inset at
     360dp: `(360 − 32 − 16) / 3 = 104`. But `93:102`'s `ScrollContent` `93:134` has a **24px**
     horizontal inset, not 16, so its content column is 345 and three FILL tiles measure 109.67.
     The tiles are FILL (not fixed 104) precisely because the code is `flex-1` — pinning 104 in a
     345 column would have left 17px of dead slack and would have been a *worse* match to the
     shipped behaviour than the "wrong" number. **The real defect is the inset mismatch: this
     frame says 24, `HomeScreen` says 16, and they have disagreed since before this pass.** One
     of them is wrong for every section on the screen, not just this strip. Not fixed here —
     changing the page gutter is a whole-screen decision and needs an owner.
  2. **Tile order: the code puts Find Care FIRST; the design brief listed it last.** The frame now
     reads `Find Care · Appts · Pharmacy / Labs · Vitals · Records`, matching
     `HomeScreen.tsx` exactly, on the standing rule that shipped behaviour is the input. **I think
     the code is wrong here and the brief's instinct was right.** Appts is the tile a returning
     patient reaches for daily; Find Care is a first-visit, low-frequency destination that was
     added to unblock a funnel, and putting it in the first slot demotes the most-used tile on the
     screen to second place to solve a discoverability problem that row 1 already solves at any
     position. Recommend moving Find Care to slot 6 (`Appts · Pharmacy · Labs / Vitals · Records ·
     Find Care`) in **both** sides, at which point the frame and the code agree again. Flagged, not
     acted on.
  3. **The "View all" affordance is still dead, and it is now dead next to a live tile.** Section
     Header `517:1947` on this frame renders `Show action = true` / "View all", and `HomeScreen`'s
     `<Section title="Quick Services" actionLabel="View All">` still passes **no `onAction`** — the
     same dead control §5's Navigation Map entry named as the cheapest place to put the booking
     entry point. That entry point now exists as a tile instead, which makes the empty "View all"
     harder to justify, not easier: there is no "all quick services" screen to go to. Either wire
     it or set `Show action = false`. Also a copy mismatch, pre-existing: the frame says "View all",
     the code says "View All".

  — **No action for Codex on `93:102` itself.** Items 1–3 are cross-cutting (page gutter, tile
  order, a dead control) and each needs one owner deciding for both sides at once.

- 2026-08-02 — Claude — **`appointment_management` `550:1826` caught up to the shipped
  booking-funnel fix.** A primary **"Book new appointment"** CTA now sits **above** the segmented
  control, in the content flow (this is a `Detail AppBar` screen; nothing docks), in **all five**
  frames on page `548:616`:

  | Frame | Node | CTA instance |
  |---|---|---|
  | `appointment_management` | `550:1826` (body `550:1843`) | `915:9845` |
  | `… / tab=Past` | `550:2974` (body `550:2976`) | `915:9849` |
  | `… / state=loading` | `550:3901` (body `550:3903`) | `915:9853` |
  | `… / state=empty` | `550:4057` (body `550:4059`) | `915:9857` |
  | `… / state=error` | `550:4182` (body `550:4184`) | `915:9861` |

  Every instance is child index 1 of `Body / Scroll Content` — after `Intro Copy`, before
  `Tab Bar / Upcoming · Past` — width `FILL` (361 at 393, 328 at 360), height 56, inheriting the
  body's existing `24` gap. No shadow. Verified at 360 by screenshot, not by arithmetic.

  **Every state got it, on purpose.** The CTA is not a property of a tab or of the list's async
  branch — in code it is static markup outside both, so a frame that showed it only when populated
  would be describing a screen that does not exist. Empty needs it most; error needs it too (it is
  the only working control when the list fails); loading shows it because booking does not depend
  on the list having arrived. **No state was left out.** The screen has no dark proof frame and
  never had one — I did not add one, but I pinned `550:4057` to Dark, screenshotted, and reverted:
  the CTA flips fill and label together, so nothing on it is a raw hex.

  **NEW LOCAL COMPONENTS, in `Local Components — appointment_management` `550:1909`:**
  - `Button / CTA + Leading Icon` — `915:9805`
  - `icon/chrome-add` — `915:9803`

  **Why this is not an instance of `Button 1:89`, with the property I read rather than the
  conclusion I drew.** `1:89`'s `componentPropertyDefinitions` is `{Variant: [Primary, Secondary,
  Disabled, Loading]}` — nothing else. `Variant=Primary` `1:83` has exactly two children, in this
  order: `Label` `1:84`, then `icon/chrome-arrow-right` `1:85`. The icon is a plain `FRAME`, not an
  `INSTANCE`, so there is no `INSTANCE_SWAP` to point at a plus. And the order cannot be changed on
  an instance: `inst.insertChild(0, inst.children[1])` throws
  `in insertChild: Cannot move node. New parent is an instance or is inside of an instance`, and so
  does appending a new child. I ran both against a throwaway instance and deleted it. **A leading
  glyph is therefore not expressible as an override of `1:89`.** Per §5c the sanctioned move is a
  page-local component plus a promotion proposal, which is this. It is not a redraw by taste: it
  reuses `1:89`'s own bindings — fill `VariableID:1:3` (primary), label `VariableID:1:5`
  (on-primary), all four radii `VariableID:1:24` (`radius/12`), Inter Semi Bold 14 / 130 %, gap 8,
  height 56 — and `icon/chrome-add` copies `1:85`'s geometry exactly (20 × 20 slot, 1.667 stroke,
  `ROUND` caps, stroke bound to on-primary), so the plus and the chevron are the same hand.

  — **PROPOSED PROMOTION, for whoever next owns the Design System page:** add an
  `Icon = None | Leading | Trailing` axis to `Button 1:89` (default `Trailing`, so the 26 existing
  instances do not move) and an `Icon` `INSTANCE_SWAP` slot, then delete `915:9805` / `915:9803` and
  re-point the five instances. Promotion is a deliberate act with its own review, not a side effect
  of this screen — I did not touch `0:1` or `26:84`.

  **DELIBERATE CHANGE FROM THE PREVIOUS FRAME, flagged because it removes an affordance:**
  `EmptyState / no upcoming appointments` `550:4165` went `Action=Yes` → **`Action=No`**. Its action
  was a second `Button 1:89` pill labelled "Find care", going to the same destination as the new CTA
  and sitting ~130 px below it on a 518-tall screen. Two full-width teal pills to one place is worse
  than one. The screen-level CTA is higher, always present, and names the outcome ("Book new
  appointment") rather than the intermediate screen ("Find care"). The error card's own action is
  **kept** — "Try again" is a different job. If a reviewer prefers the affordance adjacent to the
  message, the alternative is to restore `Action=Yes` and demote it to `Variant=Secondary`; I would
  still not ship both as primaries.

  **WHERE THE CODE AND THE DESIGN DISAGREE — required work for the code round:**
  1. **The CTA is a pill in code and a `radius/12` rectangle in Figma.**
     `AppointmentManagementScreen.tsx` passes no `pill` prop, and `Button`'s default is
     `pill = true` → `rounded-full`. `Button 1:89`'s four radii are bound to `radius/12`, and so is
     `915:9805`. Every other CTA in this file is 12. Figma is source of truth for appearance:
     **pass `pill={false}`.** (This is a pre-existing mismatch on *every* `Button` call site that
     omits the prop, not one this screen introduced — but this screen is where it now shows.)
  2. **Height 56 vs ~50.** The frame draws 56, matching `1:89`. `size="cta"` is `py-4`, which
     measures ~50. `size="docked"` is the 56 floor and is the honest match, but it is documented as
     the *docked* size, and this CTA is inline. Cleanest fix is on the code side's terms: keep
     `size="cta"` and give it the same `DOCKED_MIN_HEIGHT`-style floor of 56, or add the floor to
     `cta`. Do not hardcode `height: 56` — that is what clips at a large font scale.
  3. **Gutter: the frame pads 16, the code pads 24.** `Body / Scroll Content` has had
     `paddingHorizontal 16` since it was drawn; the `ScrollView` uses 24. So the frame's CTA is 361
     wide and the built one is 345. Pre-existing and it affects the whole screen, not just the CTA,
     so I did not "fix" it by moving the frame — **one owner should pick a number for both sides.**
     Same class of defect as the `93:102` page-gutter item above.
  4. **Vertical rhythm: the frame's 24 vs the code's `mb-md` (16).** The body's gap has been a
     uniform 24 since it was drawn and I did not break it for one child. Code should drop the
     button's `className="mb-md"` and let the container's spacing govern.

  **OBSERVED, NOT MINE TO FIX — a real dark-mode defect in a shared component.** In the Dark proof
  the `EmptyState` icon plate renders as a flat disc with no glyph. Properties read:
  `IconPlate` fill is bound to `VariableID:324:201`; the swapped glyph inside
  (`icon/calendar-add` `215:290`) has both its vectors' strokes bound to **`VariableID:1:5`
  (on-primary)**. `on-primary` is dark in Dark mode and the plate is a dark container there, so the
  glyph disappears. Every component in `Icons 24` `215:286` carries the same binding, so this hits
  every `EmptyState`, not just this one. The correct token is the plate's own content pair. The
  icons live on `74:102` (Patient Home) and `EmptyState` on `26:84` — **both outside this claim, so
  I did not touch them.** Whoever owns the DS page next should take it.

- 2026-08-02 — Claude — **`find_care` `144:108` caught up to the shipped funnel; `ProviderCard`
  `407:529` gained a `Kind=Person|Facility` axis.** — Page `144:107`. Nodes: set `915:9875`
  (`ProviderCard`, was the bare component `407:529`, now `Kind=Person`) + new `Kind=Facility`
  `915:9809`; local glyphs `915:9745/9749/9753/9757/9761` in `915:9740`; frame additions
  `916:2349` (Section Header) and `916:2359` (FacilityRail, cards `916:2360`/`916:2386`); chip
  `144:293` relabelled Departments → **Pharmacists** to match `MAIN_CHIPS`; gallery `147:148`
  gained the Kind affordance matrix `918:2403` and the 360dp proof `918:9923`. `SpecialistCard`
  `413:677` documented + wrap-fixed. — *Nothing needed from code for the card structure; the four
  items below are genuine code/design disagreements.*

  1. **The Message button outranks the funnel entry, and it is a no-op.** In
     `FindCareScreen.tsx` `PersonCard`, "View Profile" is *outlined* (`border-primary`,
     `text-primary`) and the Message button is *filled* (`bg-primary`) — while Message's
     `onPress` is an empty `// TODO: open chat thread`. So the loudest control on the card does
     nothing, and the one control that opens the booking funnel is the quiet one. Figma
     `407:549` has it the other way round and I kept it that way: filled = View Profile,
     outlined 44x44 = Message. **Code should swap the two treatments.** This is the emphasis
     only — no route changes.

  2. **The facility CTA should not be a button.** The shipped `FacilityCard` renders a
     full-width filled `tertiary` CTA whose `onPress` is a documented no-op, under labels
     ("View Staff", "View Store") that promise a destination that does not exist. A filled
     full-width button is the strongest affordance on the card; spending it on nothing is worse
     than the dead link the funnel audit set out to remove. `Kind=Facility` therefore ships
     **Directions (tonal) + Call (44x44 outlined)** instead — two things that need no new route
     and no backend, only `Linking` to maps and `tel:`. Filled primary is now reserved on this
     surface for "enters the booking funnel", which is what makes a pharmacy legible as a
     different class of thing at a glance rather than a clinician with a greyed-out day.
     **Code should replace the no-op CTA with these two.** The `hospital-detail` /
     `pharmacy-detail` route stays correctly out of scope.

  3. **`color/primary-container` is not a container.** Its Light value is `#008378` with
     `on-primary-container` = `#ffffff` — i.e. a second *filled* teal, not M3's low-emphasis
     container. I built the tonal Directions button on `color/primary-tint`
     (`#dff1ee` / `#003731`) with a `color/primary` label, which is the pairing `IconTile`
     `Tone=Tint` already uses and the only one in the file that behaves like a tonal container.
     Worth a BRAND decision: either rename `primary-container` to what it is, or give the ramp a
     real low-emphasis step. Until then, do not reach for `primary-container` expecting M3
     semantics.

  4. **The frame groups by kind; the code renders one flat list.** `144:108` has three
     header + carousel sections (Doctors / Caregivers / Hospitals & pharmacies);
     `FindCareScreen` maps `filteredEntries` into a single vertical `gap-md` column with no
     headers. This predates the funnel work and I did not resolve it unilaterally — the
     carousels are the better directory, but the flat list is what ships, and interleaving is
     arguably the more honest arrangement precisely because it puts a pharmacy card next to a
     doctor card. **One side has to move; whoever takes it owns both.** Related and smaller:
     `SpecialistCard` `413:677` keeps Follow filled and View Profile outlined, the inverse of
     `ProviderCard`. Defensible on a discovery surface, but if View Profile is the funnel entry
     there too, the two cards should agree.

  **Not done, flagged:** `find_care` has no dark proof frame, unlike `select_time_slot`,
  `review_appointment` and `booking_confirmed`. Every colour on the new nodes is variable-bound
  and audits clean, so a proof would pass — but it does not exist yet and I did not add one.

- 2026-08-03 — Claude (backend) — **`booking_service` now persists the consultation mode, and
  provisions a telemedicine room when it is video.** This closes item 2 of the 2026-08-02
  backend list ("No `join_url`, and no way to even ask for one"). Items 1, 3, 4, 5 and 6 on that
  list are untouched and still open.

  **The field is `mode` + `room_id`. There is no `join_url`, and there will not be one.**
  `telemedicine_service` has no URL concept anywhere in it: `RoomOut` is
  `{room_id, booking_id, room_name, status, scheduled_for, ended_at, recording_enabled,
  created_by_user_id}`, and a client joins by calling `GET /v1/rooms/{room_id}/token` and then
  `POST /v1/rooms/{room_id}/join` with that token in an `X-Room-Token` header. A `join_url`
  could only be synthesised from a public base URL that does not exist in this system — the
  exact "invent the field" move that produced `POST /v1/appointments`. `room_id` is the real
  handle; the app builds its own in-app route from it.

  **The new contract for the client — `BookingCreate` / `BookingOut`:**

  | Field | On | Type | Notes |
  |---|---|---|---|
  | `mode` | `BookingCreate`, `BookingOut` | `"in_person"` \| `"video"` | Defaults to `in_person` when omitted, so pre-existing callers keep working. An unknown string is a **422**, not a coercion to the default. |
  | `room_id` | `BookingOut` | UUID \| **null** | The telemedicine room. Null is legal, including on a video booking. |

  **`room_id: null` on a `mode: "video"` booking is a REPRESENTABLE, DOCUMENTED STATE, not a
  bug and not an accident.** It means "no room yet". Provisioning is attempted once, at
  creation, and it is deliberately **not** part of the booking's success condition: a patient who
  picked a slot and pressed Confirm has made a commitment, and losing it because a secondary
  service was down is strictly the worse outcome — the slot may be gone by the time they retry,
  and the clinician's calendar is the scarce resource. So the booking is created, the room is
  attempted, and on any failure `room_id` stays null and the failure is logged
  (`room_provision_upstream_error` / `room_provision_network_error` /
  `room_provision_bad_response`). **Clients must render "video link pending" for this state, never
  a dead "Join video call" button.** `appointment_management` `550:1826` therefore needs three
  states on its appointment card, not two: In person (badge, no join control), Video with a
  `room_id` (badge + live Join), Video with `room_id: null` (badge + pending, disabled). The third
  is not hypothetical — it happened for real during this round's verification, and that row is
  still in the dev database (`bb958b18-9a88-450b-944c-b25055d3cc7f`).

  **Migration `20260803_0002` on `bookings`, run against `medapp_pgdata` with two real rows in
  it.** `mode` is `VARCHAR(16) NOT NULL` with `server_default 'in_person'` (kept, not dropped —
  a writer that predates the model change should still insert a legal row rather than trip a NOT
  NULL violation), plus `ix_bookings_mode`. `room_id` is a nullable UUID with **no** FK: the room
  is a row in telemedicine_service's own database. String + a Pydantic `StrEnum` at the boundary
  rather than a PG ENUM, matching `status` in the same table and every other service here, so a
  third modality can ship as one deploy instead of an `ALTER TYPE ... ADD VALUE` that cannot run
  inside a migration transaction. Both steps are inspector-guarded; I proved re-runnability by
  stamping the revision back and running `upgrade head` a second time over columns that already
  existed.

  **What the backfill asserts, said out loud:** every booking created before this column existed
  was in person. It is safe because the client had no field in which to express a mode and the
  server never provisioned a room, so no pre-existing row can have a session behind it. And the
  two possible errors are not symmetric — labelling a video booking "in person" sends a patient
  travelling, which they discover and can fix with a phone call; labelling an in-person booking
  "video" tells them to stay home waiting for a link that will never arrive, and they miss the
  appointment. `in_person` is also the value that renders no video affordance, so a backfilled
  row cannot produce a dead Join button.

  — **A real, pre-existing outage found and fixed on the way: `POST /v1/rooms` could never
  succeed.** `shared.db.TimestampMixin` declares `created_at`/`updated_at` with
  `server_default=func.now()`, but telemedicine's initial revision `20260518_0001` created all
  three tables `NOT NULL` with **no** server_default, so every INSERT died on
  `NotNullViolationError: null value in column "created_at" of relation "rooms"`. Not one room,
  participant or message could ever be created in a migrated database — since May.
  `telemedicine_service/alembic/versions/20260803_0002_timestamp_server_defaults.py` restores the
  defaults on all three tables. Two things worth keeping from this:
  **(1) the graceful-failure design is what made it visible** — the first video booking returned
  201 with `room_id: null` and one log line, instead of 500-ing and burying the cause;
  **(2) telemedicine's own 6 tests pass and always did**, because its conftest builds the schema
  with `Base.metadata.create_all` from the model, which carries the server_default the migration
  omitted. A suite that builds its schema from the models cannot tell you the migration disagrees
  with them. That is the same shape as "a test that mocks the boundary cannot tell you the
  boundary is wrong", one layer down.

  **Verified over HTTP through the gateway on :8010** as the seeded patient, not in a test
  harness: in-person 201 → `mode: "in_person"`, `room_id: null`, zero calls to telemedicine;
  video 201 → `mode: "video"`, `room_id: "27db4d6b-2533-4afa-b807-2c14a4a621cd"`, and
  `GET /v1/rooms/27db4d6b-…` returns 200 with `booking_id` matching the booking — the stored
  handle actually resolves. `mode: "telehealth"` → 422. `GET /v1/bookings` returns all five rows
  including the two pre-migration ones, correctly backfilled `in_person`. 21 tests in
  `booking_service` (9 new), 6 in `telemedicine_service`.

  — **For the client side (mobile), in priority order:** (1) send `mode` from the booking flow —
  it is currently dropped at the boundary; (2) `booking_confirmed` may now say "in-person"
  truthfully, because the server stores it; (3) build the `appointment_management` badge and Join
  control off `mode` + `room_id`, with the three-state rule above; (4) the join itself is
  `token` then `join`, not a URL navigation. — **For the designer:** the 2026-08-02 note
  "STILL UNTRUE COPY" is now half-resolved. A video booking has a real room, so "join" copy can
  exist — but "The join link opens 10 minutes before the start" is still wrong twice over: there
  is no link, and nothing in `telemedicine_service` gates joining on a time window. New words
  needed, and they should describe a **room you enter**, not a link that opens. The pending state
  needs copy too.

- 2026-08-03 — Claude — **There was no way to sign out of MedApp, and the fix un-orphaned two
  more things.** From the 360dp device session on the Itel S25 Ultra. —
  `frontend/mobile/MedAPP/src/components/shell/AccountMenu.tsx` (new),
  `PatientShell.tsx`, `PatientAppBar.tsx`, `shell/index.ts`, `shell/README.md`,
  `shell/__tests__/{AccountMenu,PatientShell,PatientAppBar}.test.tsx`.

  Sign-out was not hidden, it was **absent**. `useAuthStore.signOut()` had been implemented since
  the auth store landed and was called from **nowhere in the app**. The reason was one prop:
  `PatientAppBar.onAvatarPress` was plumbed through `PatientShell` and **no screen passed it**, so
  the avatar was a dead 44pt control on all 12 patient screens. Two more things were unreachable
  for the same reason: `/(app)/patient-profile-overview` — a built screen verified against frame
  `261:387` that **nothing in the app linked to** — and `<AppearanceSelector />`, the three-way
  light/dark/system preference, whose only reference in the tree was the barrel that exported it.
  One default in the shell fixes all four.

  The menu lives in the **shell**, not in the screens, for the same reason `PATIENT_TAB_HREFS`
  does: five tab roots render that bar, and the last time this class of behaviour was left to
  per-screen wiring, three roots silently dropped the Inbox tab and it took a route audit to find.
  Sign-out is guarded twice on purpose — separated (last row, below a hairline, after the whole
  Appearance block, the only `error`-toned item) **and** confirmed (`signOut()` calls
  `secureStorage.clearAll()`, so the recovery is re-authenticating, not an undo). It then
  navigates itself with `router.replace("/(public)/sign-in")` rather than letting `(app)`'s
  `<Redirect>` sweep up after it, which would leave a frame of authenticated UI on screen.

  — **FOR THE DESIGNER, TWO THINGS. (1) This menu has NO FRAME and needs one.** It was built from
  existing design-system pieces and kept deliberately plain; it is an interim, not a spec. **(2)
  It is the wrong shape at 360dp and the arithmetic says so, which is a design decision, not a
  build one.** `AppearanceSelector` is three `flex-1` cells and each needs
  `px-sm`×2 (24) + icon 18 + `gap-xs` 4 + "System" at `label-md` ≈ 50 = **96dp**, so
  3 × 96 + its own `p-xs`×2 (8) + border×2 (2) = **298dp of content, intrinsically**. With 16dp
  margins a 360dp screen allows a 328dp panel at most, so the panel is 320 and its padding had to
  drop to 4 (at 12 it would need a 322dp panel — 304 of content, 18dp short, and "System" wraps or
  clips on the device). A 280 panel, which is what a menu normally wants, gives 272 and is **26dp
  short**. The consequence: at 393 a 320 panel leaves 57dp of scrim on its left and reads as a
  **menu**; at 360 it leaves 24dp and reads as a **sheet**. Same component, two affordances, purely
  because the selector's intrinsic width is fixed while the screen is not. The call is yours —
  either `AppearanceSelector` gets a compact variant (stacked rows, or icon-only cells with the
  label under them) and the menu can be 280 everywhere, or this becomes a real bottom sheet and
  stops pretending to hang off the avatar.

  — **For whoever next touches `src/components/ui/`** (this batch did not own it): the confirm
  dialog in `AccountMenu` is the **second** copy of "centred scrim + card + `outline` cancel +
  `error`-filled confirm" in the tree; `features/telehealth/components/LeaveCallDialog.tsx` is the
  first. Extract a shared `ConfirmDialog` and retire both.

- 2026-08-03 — Claude — CLAIM page `945:5796` "Account Menu" for the account-menu flow:
  `account_menu` (menu) + its sign-out confirmation. Expected 8 frames. **Claim stays OPEN** — the
  design gate is stages 1–4 and §5c is explicit that a claim released there leaves work nobody owns.
  Codex is offline until 8 August, so no page is contended.

- 2026-08-03 — Claude — CLAIM page `74:102` "Patient Home" for `overview` (`OverviewScreen`), the
  Health Hub tab root, which shipped on device with **no Figma frame at all**. Expected 3 frames.
  **Claim stays OPEN** through Build + BuildReview per §5c.

  Delivered, all 393 wide, placed at y=5400 clear of the existing frames:
  `overview` **949:10550** (populated) · `overview — Trend range = 1Y` **949:12762** ·
  `overview — Dark proof (pinned Colors/Dark)` **949:13208**.
  Local components frame `Local Components — overview` **949:1181**.

  Anatomy → shared component: `Patient AppBar` `101:142` (`Back=Hidden`, tab root, no back) ·
  `Patient BottomTabBar` `740:863` (`Active=Overview`, absolute, `vertical:MAX`) ·
  `Section Header 517:689` ×5 · `Tab Strip 517:1522` (the trend-range switch) ·
  `VitalStatCard 211:241` ×4 · `Button 1:83`/`1:87` (Report / Export) ·
  `IconTile 517:1435` (insight glyph) + `517:1415` (milestone glyphs) ·
  `KeyValueRow 517:1718` ×4 (devices + doses) · glyphs `550:831`, `530:809`, `528:853`, `528:820`.

  Built locally, with why: `Sparkline / 7-bar` **949:1190** (VitalStatCard has no chart, by design —
  charting must stay out of the primitive) · `MilestoneRow / Overview` **949:10363** (nothing in §3
  draws a timeline rail) · `ScriptRow / Overview` **949:10374** (`KeyValueRow` ships **one** trailing
  action; a script needs two peers) · `icon/sleep` **949:1196** and `icon/hydration` **949:1199**
  (14px, stroked to the file's icon convention — neither glyph existed).

  **Shared component extended (own page, default-off, existing instances verified unchanged by
  screenshot of `213:471`):** `VitalStatCard 723:625` gains `Show sparkline` (BOOLEAN, default
  **false**) + `Sparkline` (INSTANCE_SWAP) on the two `layout=Card` variants only — the Figma
  counterpart of the code's `footer` slot, which is Card-only in code too.

  **The range switch is a Tab Strip, not a ChoiceChip.** `useState<TrendRange>` is
  exactly-one-of-four and can never be empty or multiple; `ChoiceChip`'s
  `State=Default|Selected|Unavailable` is a per-chip toggle whose contract permits both. And no item
  leaves the collection when the range changes — the whole trends region is re-read against a
  different series. That is a tab. In the frame it is promoted out of the card-header corner to a
  full-width strip under the Section Header. 360 arithmetic: 360 − 2×16 gutter = 328 card, − 2×24
  inset = 280 content, − 3×8 gaps = 256 ÷ 4 = **64 per tab** (72.25 at 393). Nothing slices, nothing
  truncates — verified on a 360 clone that was deleted in the same script.

  **Proposals, not done here** (§5c forbids editing the Design System page mid-claim):
  `KeyValueRow` needs a `Badge tone = Success | Neutral` axis — the pending-dose badge is a
  per-instance token override today. `VitalStatCard` wants a `Show trend` BOOLEAN — the code gates
  `TrendRow` structurally and the frame can only hide it per instance. `Sparkline / 7-bar`,
  `icon/sleep` and `icon/hydration` are promotion candidates.

  — **Required work for the Build round** (§5c step 7; every item is a place the code is wrong and
  the frame is now right):
  1. `prescriber: "Dr. Sarah Jenkins"` / `"Dr. Mark Chen"` and `patient: "Alex Rivers"` exist
     nowhere in `scripts/seed_dev_data.py`. The frame uses the seeded clinicians —
     **Dr. Adjoa Boateng (Cardiology)** and **Dr. Kwabena Osei (General Practice)**; the seeded
     patient is **Ama Mensah**. `SCRIPTS[].patient` is not rendered on this screen but is pushed
     into `active-script-share` / `active-script-view` as a param, so the invented patient name
     escapes this file — fix it at the source. Milestone body copy loses "Dr. Jenkins" the same way.
  2. Raw hexes to delete: `MILESTONES[].tint` `#00685f` and **`#0058be`** (a blue in no token),
     the timeline rail `#e4e9e7`, `DEVICES[].swatch` `#000000` / `#1e293b`, the dose left-border
     `#00685f` / `#dee4e1`, and the `#00685f` / `#ffffff` / `#171d1c` / `rgba(0,104,95,0.08)` /
     `rgba(0,104,95,0.4)` literals on the insight card, buttons, section icons and `ScriptAction`.
  3. `rounded-2xl` (16) on the insight card and `rounded-xl` (12→ok) mix: the frame is `radius/24`
     for every card, `radius/12` for the script row. `MiniChart`'s `borderRadius: 1` is off every
     scale — the frame is `radius/4`, top corners only.
  4. Card inset: the frame uses BRAND's **24**, not the code's `p-md` (which is also 24 — no change)
     but the *cards* are the shared `Card` role `card-surface`, not `surface-container-lowest`.
  5. The dose "not taken" state is `opacity: 0.6` on the whole row plus a colour-only 4px left
     border. That dims body text under 4.5:1 and is colour-as-only-signal (BRAND, WCAG 1.4.1). The
     frame replaces both with **words in a badge** — "Taken" / "Due tonight" — at full opacity.
  6. Page heading "Health Hub" was `headline-md` (20) in `text-primary`. The frame sets
     `headline-xl` (28) `on-surface`: BRAND assigns `headline-xl` to screen titles, and teal is
     scoped to CTAs, active states and the logo — a static heading is none of the three.
  7. Section headings were five hand-typeset `<Text>` at an inline `fontSize: 20`. All five are
     `Section Header 517:689` in the frame; "Medication Adherence" carries its "View all" through
     the component's own action slot instead of a bespoke `Pressable`.
  8. `ScriptAction` is a `label-sm` (12) text link with `hitSlop={6}` — under the 44pt floor. The
     frame's Share / View Rx are `label-md` in 44-high targets.
  9. **The range switch is inert.** `TREND_METRICS[].bars` is static, so `setRange` changes nothing
     but which pill is teal. Frame `949:12762` shows what 1Y must actually look like (re-scoped
     values *and* series). Either wire the range to a query or remove the control.
  10. Dropped from the code deliberately: the 64px `auto-awesome` watermark bleeding off the insight
      card (decoration carrying an untokenised `rgba`), the `cloud-done` glyph at 40% opacity in the
      Data Integrity header (decoration), the device brand swatches (they carried the two raw
      hexes), the leading `download` / `share` glyphs on the two buttons (**no such glyph exists in
      this Figma file** — add `icon/download` and `icon/share` and they come back), and the italic
      on the quoted milestone body (there is no italic in the brand type ramp).
  11. `paddingBottom: 140` → an **80** bottom safe area (48+32, on scale) which still clears the
      64dp absolute tab bar with 16 to spare.
  12. Registry gap now closed on the Figma side only: `icons/registry.ts` still has no `hydration`
      entry (`OverviewScreen` flags it) and no `sleep`/`trend-*`/`alert`. Figma now has
      `icon/hydration` and `icon/sleep`.

  — **States NOT framed, with the reason.** `OverviewScreen` has **no async surface at all**: every
  section reads a module-level `const` (`TREND_METRICS`, `MILESTONES`, `DEVICES`, `MED_DOSES`,
  `SCRIPTS`), there is no fetch, no store read and no query, so there is no loading, empty, error or
  offline branch to frame — drawing one would be inventing a branch, which §5c step 1 forbids. The
  only state the code can produce is the trend range, and that is frame `949:12762`. The file's own
  comment says the screen is destined for `ehr_service` / `wearable_sync_service`; **at that wiring
  the async states become required**, and `SkeletonCard 517:2291` already ships a
  `Shape=Vital stat card` variant sized for exactly these tiles.

- 2026-08-03 — Claude — DESIGN LANDED. `src/components/shell/AccountMenu.tsx` shipped with no frame
  at all; page `945:5796` closes that. Frames, all 393 wide except the deliberate 360 proof:

  | Frame | Node | What it is |
  |---|---|---|
  | `account_menu — menu · Appearance = System` | `949:10931` | populated, default |
  | `account_menu — menu · Appearance = Light` | `949:11028` | control position 2 |
  | `account_menu — menu · Appearance = Dark` | `949:11139` | control position 3 (light frame — the control's position, not the theme) |
  | `account_menu — menu · no display name` | `949:11490` | `accountName.trim() \|\| "Your account"` + silhouette avatar tier |
  | `account_menu — confirm sign out` | `949:11590` | the second view of the same modal |
  | `account_menu — menu · DARK proof` | `949:11872` | pinned Dark via `setExplicitVariableModeForCollection` |
  | `account_menu — confirm sign out · DARK proof` | `949:11969` | pinned Dark; drawn because `error`/`on-error` is the pairing this project has shipped wrong three times |
  | `account_menu — menu @ 360dp (width proof)` | `949:12043` | 360×800 |
  | `Account Menu — decisions & arithmetic` | `949:13114` | the reasoning, on canvas |

  **Anatomy → shared component.** App bar `Patient AppBar 741:887` (`Back=Hidden`, `101:142`),
  bottom nav `Patient BottomTabBar 740:1015` (`Active=Home`, `101:143`), identity avatar
  `Avatar 550:1964` (`Size=40, Fallback=Initials`, and `Fallback=Silhouette` on `949:11490`),
  dialog cancel `Button 1:89` (`Variant=Secondary`), type through the six shared text styles,
  floating shadow through the `elevation/floating` effect style. Nothing was hand-drawn that §3
  already had.

  **Built LOCAL, in `Local Components — Account Menu` `949:609` — PROPOSE PROMOTION, do not promote
  as a side effect.** Nothing existing covered any of these:
  - `Account Menu` `949:10651` — component **set**, `View=Menu | Confirm sign out`. One set, not two
    components, so the file records that in code it is one `<Modal>` swapping content (stacked RN
    Modals on Android are unreliable). `View=Menu` `949:10512` (304×283), `View=Confirm sign out`
    `949:10626` (361×364).
  - `AppearanceSelector` `949:10250` — `Selected=System | Light | Dark`. The orphaned three-way
    control had no Figma representation at all.
  - `Button / Destructive` `949:10313` — `Button 1:89` has `Primary | Secondary | Disabled | Loading`
    and no destructive tone. Geometry is copied from `1:89` (345×56, `radius/12`) so it stacks with
    `Variant=Secondary`. **Proposed promotion is a `Tone=Brand | Destructive` axis on `1:89`, not a
    second button component.**
  - Six glyphs — `icon/chrome-person` `949:612`, `icon/chrome-chevron-right` `949:615`,
    `icon/chrome-logout` `949:617`, `icon/chrome-theme-auto` `949:620`,
    `icon/chrome-light-mode` `949:623`, `icon/chrome-dark-mode` `949:626`. The file had **no**
    chevron, person, logout, sun or moon; `search_design_system` and a full sweep of the Design
    System page confirm it. Drawn on the 24 grid with `SCALE` constraints so they instance at 20.
  - One **variable**: `color/scrim` `VariableID:945:5797` (Light `#0D1A17`, Dark `#000000`, matching
    `global.css --color-scrim`). Additive — no existing node references it. The file had no scrim
    token, which is why a modal frame could not previously have been tokenised at all.

  **States NOT framed.** No loading/empty/error/skeleton: the component takes no async data, it is
  prop-driven off `PatientShell` and renders synchronously — there is no branch, and a `SkeletonCard`
  here would picture a state the code cannot enter. No pressed frame: `active:opacity-70` and the
  confirm button's `0.78` are opacity multipliers on the resting design, not token changes. No
  `visible={false}` frame: the Modal renders nothing. The avatar's photo/initials tiers are
  `Avatar 550:1964`'s own variants, not menu states.

  — **REQUIRED WORK for the build round. Nine places the code is wrong and the frame is now right.**
  1. **Three hairlines become one.** The code draws a rule after the identity row, after Profile, and
     above Sign out. The third is a *guard*; the first two are decoration, and they make the guard
     read as the third of three identical lines. Keep only the one above Sign out (8dp above, 8dp
     below) and separate the benign boundaries with the spacing scale — docs/MOBILE_UX.md: "prefer
     removing a divider over adding one".
  2. **The confirmation's stacked button order is inverted.** The code stacks *Stay signed in* above
     *Sign out*, copying `LeaveCallDialog`'s "cancel FIRST" — correct for a horizontal pair
     (cancel-left), wrong when stacked, because it puts the destructive button nearest the thumb.
     Frame order is **Sign out, then Stay signed in**.
  3. **The confirmation must carry the identity block.** Avatar + name + "Signed in", same anatomy as
     the menu. The identity row exists so "Sign out" names an account instead of being an anonymous
     red row; the code drops it in the one state where that matters.
  4. **`MENU_MAX_WIDTH` 320 → 304, `PANEL_PAD` 4 → 8.** This is the answer to the 360dp question the
     file's own header flags, and it is neither a compact selector nor a bottom sheet: at 360,
     `360 − 16 − 304 = 40dp` of scrim on the left, so it still reads as a menu. The 320/4 shipped
     version leaves 24dp, which is where it starts reading as a sheet. Room comes out of the
     selector's cell padding, not its labels: 288 track − 8 padding = 280 over three `flex-1` cells =
     93.3 each, against a widest content of 20 + 4 + ~50 = 74. Row `px-3` → `px-2` (8), so text still
     sits 16 from the panel edge (8 + 8) while the selector keeps the full inner width.
  5. **`AppearanceSelector`'s `rounded-lg` is 8px — off the radius scale.** BRAND is 4/12/24/full.
     Frame uses `radius/full` on the container **and** the cells: a segmented control is a set of
     pills, which is the one role BRAND scopes `full` to, and it concentrically nests where 12-in-12
     does not.
  6. **`AppearanceSelector`'s `border-outline-variant/40` is deleted, not retokenised.** BRAND
     Elevation: separation comes from surface tone. `bg-surface-container` already does it, and a
     40%-alpha hairline inside a panel that has a full-strength one is a second, weaker rule.
  7. **The dialog buttons are `rounded-full`; they must be `radius/12` and 56 tall.** `Button 1:89`
     is 345×56 at radius 12, BRAND scopes `full` to pills and avatars, and the frame instances the
     real component rather than a hand-rolled 48-high pill.
  8. **The `system` glyph must stop being a sun.** The code maps `system` → `brightness-auto`, which
     is a **sun with an A**, sitting immediately beside `light` → `light-mode`, which is a **sun**.
     Two suns in a three-cell control, and "auto brightness" is a device display setting, not "follow
     the device theme". The frame draws a half-filled disc (`icon/chrome-theme-auto` `949:620`);
     MaterialIcons `contrast` is the closest shipped equivalent for `Icon.tsx`'s registry.
  9. **Glyph sizes go on the BRAND ladder.** `GLYPH = 22` and the selector's `size={18}` are on no
     step. Frame: **24** in the menu rows, **20** in the selector cells ("24px default, 20px in dense
     rows").

  Behaviour is preserved everywhere else, deliberately and including the parts that look odd: the
  lazy `require` of `@/store/auth-store`, `useContext(SafeAreaInsetsContext)` over
  `useSafeAreaInsets()`, `statusBarTranslucent`, `router.replace` before `signOut()`,
  `router.navigate` (not `push`) to the profile, the empty `onPress` responder-claim, and reopening
  on `View=Menu`. The frame's right edge at `393 − 16 = 377` is exactly where the bell's 44pt target
  ends, so the existing anchoring maths is correct and stays.

  — **Not a defect, checked so nobody re-files it:** the wordmark looks washed out in the two dark
  proofs. `101:105` opacity is bound to `logo/opacity-primary` (Light 100 / Dark 0) and `451:680` to
  `logo/opacity-reversed` (Light 0 / Dark 100), so the swap is wired correctly; the dimming is the
  40% scrim sitting over the app bar, which is what the code does too.

  — **Two landmines this hit, both worth fixing properly and neither owned here.** (1)
  `AccountMenu` reaches `@/store/auth-store` by a **lazy `require`**, not a static import, because
  a static import pulls in `@/lib/config`, whose `readExtra()` throws at require time under Jest;
  a static import in a SHELL file would force a `jest.mock` into ~10 suites across four parallel
  batches. (`await import()` does not work either — jest-expo's CJS VM rejects it with
  "--experimental-vm-modules", which means `auth-store.hydrate()`'s own dynamic import is
  untestable.) The real fix is for `@/lib/config` not to throw at module scope. (2) `AccountMenu`
  reads the top inset via `useContext(SafeAreaInsetsContext)`, not `useSafeAreaInsets()` — the
  latter **throws** with no `<SafeAreaProvider>`, and since the shell mounts this on every patient
  screen, the first cut took out six `FindCareScreen.routing` cases in another agent's batch. Most
  screen suites render raw; anything mounted unconditionally by a shell has to tolerate that.
  Covered now by a regression case in `AccountMenu.test.tsx`.

  — **One real a11y defect fixed on the way past, in `PatientAppBar`.** Its pressable-avatar
  branch wrapped `AvatarWithFallback` — which carries its own `accessibilityRole="image"` + label —
  in a `Pressable` with the SAME label, so the name was published twice and TalkBack walked both
  ("Melchizedek Narh, button. Melchizedek Narh, image."). Latent for the bar's whole life because
  nothing ever passed `onAvatarPress`; live on 12 screens the moment the shell started supplying
  the menu. The inner node is now demoted to decoration by clearing its role/label rather than by
  hiding the subtree — hiding would also swallow the initials `<Text>`, i.e. the evidence that the
  fallback chain picked initials over the silhouette.

- 2026-08-05 — Claude — CLAIM page `49:102` "Onboarding & Auth" for the **public unauthenticated
  flow**: `forgot-password` (a flow, not a page), `privacy`, `terms`. All three are `"Coming next."`
  stubs in code, so this round is **design-FIRST** — there is no shipped behaviour to preserve and
  the frames lead the build. Placed clear of Splash `50:105`, Login `57:102`, `onboarding_status`
  `72:117` and `765:696`; the three new rows start at y=1600. Delivered 13 frames + 2 notes frames.

  **Frames.** forgot-password: `forgot_password / request` **949:10169** (populated) ·
  `— invalid email` **949:10375** · `— sending` **949:10426** · `— network error` **949:10454** ·
  `check your email` **949:10589** · `set new password` **949:10870** ·
  `set new password — code invalid or expired` **949:11325** · `password updated` **949:11373** ·
  `— DARK PROOF` **949:14517**. Documents: `privacy` **949:12301** (1787 tall) ·
  `terms` **949:12680** (2077 tall) · `privacy — DARK PROOF` **949:14526** ·
  `terms — DARK PROOF` **949:14552**. On-canvas reasoning: `NOTES — forgot-password / privacy /
  terms` **952:1047** and `NOTES — required BUILD work` **952:13213**.

  **Anatomy → shared component.** Chrome on all 13: `Detail AppBar 193:120` — these are Detail
  screens, so **no** patient bar and **no** bottom tab bar, which is also correct for
  unauthenticated routes. Fields: `Input 1:52` (`State=Default` ×6, `State=Error` ×2). CTAs:
  `Button 1:89` (`Variant=Primary` ×7, `Variant=Loading` ×1). Card shell: `Card / Form 435:503` on
  the four request frames. Confirmation glyph plates: `IconTile 517:1515` `Size=56, Tone=Tint`.
  Callouts: `InfoCallout 756:4107` ×4. Document metadata rows: `KeyValueRow 517:1772`
  `Emphasis=Value, Trailing=None` ×2 per document (Last updated / Version). Document section
  rhythm: `Section Header 517:689` ×5 on privacy, ×6 on terms. Glyphs all via existing icon
  components (`icon/chrome-mail 9:28`, `icon/lock 9:31`, `icon/chrome-eye 9:34`,
  `icon/secure 363:565`, `icon/info 517:1778`, `icon/chrome-refresh 9:37`).

  **Account enumeration — the decision.** An unknown address is **never revealed**, and there is
  deliberately no "no account with that email" frame. `user_service/app/routers/password.py:19-32`
  returns `202 {"status":"ok"}` unconditionally and does not branch on
  `request_password_reset()` returning `None`, so the state is unproducible; drawing it would ask
  the build to reintroduce a leak the backend author removed on purpose. On a medical product that
  sentence is an oracle for *care relationship*, not for a password. `check your email` **949:10589**
  is therefore byte-for-byte identical for a registered and an unregistered address and its copy is
  written to be true in both cases — "If this address is registered with MedApp, a reset code is on
  its way." **The conditional is a security requirement; it must not be flattened to an assertion in
  the build.** The frame says the stance out loud in an InfoCallout so the hedge reads as policy.

  **States NOT drawn, with reasons.** (a) "email not registered" — above. (b) Loading/error for
  privacy and terms — designed as static in-app copy, not fetched, so there is no async branch; a
  policy that fails to load blocks consent at the moment consent is requested, and the sign-up
  consent row cannot honestly be ticked against a spinner. If product later fetches the copy or
  opens it in `expo-web-browser`, both screens need loading + error frames. (c) Rate limit / 429 —
  the gateway has `auth_rate_limit` middleware but the password routes document no 429 body, so
  there is nothing specific to depict. (d) Password-strength meter — a new component, not a state.
  (e) `ErrorPanel 517:2111` is deliberately unused: nothing failed to *load*, the form is present
  and retryable in place, so the register is an inline `InfoCallout`, matching what
  `SignInScreen.tsx` already does.

  **Built locally, with why.** Only one thing: the card container on `949:10375` is a local frame,
  **named** `Card / Form (local frame — 435:503 has no validation slot)`, carrying identical
  bindings. `Card / Form 435:503` has no slot for a field-level validation message, so the
  error-state frame cannot use it. That is a component gap, logged below — not a licence to redraw.

  **360dp arithmetic.** Frames 393 wide; body inset 16/16 on every frame, matching
  `Detail AppBar`'s own 16 per BRAND ("body sections must share the same left/right inset as the app
  bar above them"). Content column 393−32 = **361** at 393, 360−32 = **328** at 360. The form card
  is FILL (361 / 328) with a 32 inset, giving an inner column of 297 / 264. Every child is FILL or a
  centred fixed 56 tile — **there is no multi-item horizontal strip in this delivery**, so nothing
  can half-slice. Verified by rendering, not arithmetic: all four populated frames plus both
  documents were cloned to 360, screenshotted, and deleted. One real defect was found that way — the
  reset-code placeholder read "Paste the code from your email", which wrapped to two lines at a 264
  inner column and pushed the 52 Input to 60; it is now "Paste your reset code". All eleven section
  headings fit at 328 without ellipsis. Note Login `57:102` uses a 24 inset and a 345 card; these
  frames use 16 / 361 because they have an app bar to match. Flagged, not propagated.

  **Legal copy is not designer-owned.** Every paragraph in `949:12301` / `949:12680` is lorem ipsum
  on purpose and the headings are structural placeholders; the wording, the ordering, "Last updated
  12 July 2026" and the version numbers are **not approved content** and are owned by counsel. What
  *is* specified and must be built: body copy is `body-md` on `on-surface` (not
  `on-surface-variant` — long-form needs full contrast in both modes); the document sits directly on
  `background` with **no card**, because a card around 1,800px of text recedes rather than lifts;
  rhythm is `Section Header` + 24 between sections, 12 between paragraphs; bottom inset 48 so the
  last line clears the gesture bar; and the `Detail AppBar` is persistent chrome **above** the
  scroll view so back is reachable from any scroll position — that is the way out, and there is no
  in-body "back to sign in" link.

  **REQUIRED BUILD WORK — the code is wrong or absent and the frame is now right.** Full text on
  `952:13213`; the load-bearing items: (1) all three screens are new code. (2) There is **no API
  layer for password recovery at all** — grep of `src` for `password/forgot`, `password/reset`,
  `forgotPassword`, `resetPassword` returns zero hits and `features/auth/api.ts` exports no such
  call, though both endpoints exist and are gateway-routed under `/v1/auth`. Assert the **path and
  body** in the tests; a mocked client will happily accept a fabricated URL, which is how the
  booking flow shipped a 404 past 595 green tests. (3) All three must use
  `DetailShell` (`src/components/shell/DetailShell.tsx`), not a bare `SafeAreaView`, claim all four
  insets, and never render a bottom nav. (4) **Navigation defect:** `privacy.tsx` and `terms.tsx`
  exit with `<Link href="/(public)/sign-in">`, but they are pushed from the *sign-up* consent row
  (`SignUpStep1Screen.tsx:367/375`, `SignUpStep3Screen.tsx:358/366`) as well as the sign-in footer —
  so that link ejects a mid-signup user out of a half-filled form into sign-in. The frames give
  exactly one exit, the app bar back, which must be `router.back()`. (5) forgot-password keeps its
  "Back to sign in" text link (it is on the shipped stub) but it must be a real 44pt target and must
  not be the only exit. (6) `password updated` **949:11373** is terminal because the reset token is
  single-use and consumed — app bar back **and Android hardware back** must both route *forward* to
  sign-in; popping returns to a form whose token can no longer be redeemed. A green suite will not
  catch this. (7) The rule shown on `set new password` is the **sign-up** rule ("Min 8 characters, 1
  number, 1 symbol", `SignUpStep1Schema`), not the backend's — the backend enforces only
  `min_length=8` (`schemas/auth.py:82`), so without the client rule a user can reset to a password
  they could never have registered with and the two screens would state different rules for one
  credential. Enforce the sign-up regexes client-side on reset. (8) "Updating your password signs
  you out of MedApp on every device" is **true** — `reset_password()` calls `_revoke_all_for_user()`
  — so the build must actually clear the local session rather than leave a revoked refresh token in
  place. Delivery is `LogEmailNotifier` and the token is an opaque string with no link, which is why
  the flow asks the user to **paste a code** and never depicts a deep link or a formatted code mask.

  **Design-system gaps this round surfaced** (none fixed — the Design System page is not mine to
  edit mid-claim, per §5c): (a) `Card / Form 435:503` had **zero** instances anywhere in the file
  before this round, fits exactly one shape (one field, one consent row, one CTA), and has no
  validation-message slot — give it a field-count/slot story and a validation line, or stop calling
  it a component. (b) `Input 1:52` has no **Filled** state, so a typed value can only be shown by
  overriding the placeholder text node's fill to `on-surface`; done here on five instances. (c)
  `Input 1:52`'s trailing slot is still named "Eye Toggle Target (44x44)" (`1:43` child `318:654`) —
  the long-standing §5b item, untouched. (d) `Button 1:89` `Variant=Loading` contains **only** a
  Label — measured `children = [Label]`, no spinner — while the code's `Button` renders one, so
  `949:10426` can only show a label change. Add a spinner to the variant. (e)
  `Section Header 517:689`'s Title has `textTruncation = "ENDING"`, so a long heading clips instead
  of wrapping; one terms heading had to be shortened from "4. Appointments, payments and
  cancellations" to "4. Payments and cancellations". Either allow wrapping or accept that legal
  headings must stay short. (f) `InfoCallout 756:4107` is still page-local on
  `Local Components — review_appointment` and marked PROMOTE; these frames instance it four times
  from a second page with no local duplicate, so it now has cross-page consumers — promote it. Its
  variant axis is `Tone=Info | Warning` with **no Error value**, and the Warning variant paints
  `error-container`/`error`; the code's `InfoCalloutTone` is `"info" | "error"`. The frames use
  `Tone=Warning` for the transport failure on `949:10454` because it is the only red register
  available. Rename the variant to `Error` (or add one) so the axis and the code agree.

  **Verification.** All 13 frames screenshotted and inspected, not trusted from metadata. Audited
  programmatically: **0 unbound solid fills** across all 13 frames (every colour through a variable,
  white included), **0 visible drop shadows**, minimum font size **12**. All three DARK PROOF frames
  carry `explicitVariableModes = {"VariableCollectionId:1:2": "197:0"}` and flip completely —
  including the app bar, the long-form body copy and the `KeyValueRow` metadata — so nothing on
  these screens was left un-tokenised. **Claim stays OPEN: stages 5–6 (Build, BuildReview) are part
  of it and it is not released at the design gate.**

---

- 2026-08-03 — Claude — **The logo is now ONE token-driven lockup on both sides.** Reported from
  the device: "the logo in dark mode is not right."

  **Code:** `assets/branding/logo-reversed.png` was CORRUPT — a near-empty image in which only the
  letter counters (the holes in e/d/p) survived, strokes gone. `Logo` now renders one monochrome
  asset with `tintColor` bound to the mode's own `primary` (teal light / mint dark) and the corrupt
  file is deleted. Taking the request literally — "use the light logo in dark mode" — would have
  shipped teal on near-black at about 1.9:1, so the tint is what makes "the same logo" legible.
  `reversed` survives as a variant name but now means "tint for a dark surface", for callers placing
  the mark on an always-teal hero card.

  **Figma:** worse than a wrong colour. `Logo` `101:103` and `741:872` inside `Patient AppBar` each
  held TWO rasters — `Logo (PNG) — primary` and `Logo (PNG) — reversed` — **both `visible=true`,
  stacked**, so the light artwork sat permanently over the teal and the lockup could not respond to
  mode at all. Both frames now hold one instance of the vector `Wordmark 26:98`, whose type is bound
  to `color/primary`, so it flips on its own.

  `Wordmark / Reversed (on dark)` `180:344` and `Icon / Reversed (on dark)` `180:351` are marked
  DEPRECATED with the reasoning in their descriptions, not deleted — both had **zero** instances,
  and `180:351` carried three raw `#ffffff` fills. Retired rather than removed so nobody re-adds a
  second component that cannot follow the mode.

  — **Also found, not fixed: `color/white` resolves `#ffffff` in BOTH modes.** That is a fixed
  colour wearing a token's name, and it will read as safe to anyone who checks only that a variable
  is bound. Worth auditing its call sites and probably retiring it.

- 2026-08-05 — Claude — CLAIM page `949:10202` **"Community"** (new) for `CommunityScreen`, a
  patient TAB ROOT (`Patient BottomTabBar Active=Community`). Delivered **7 frames + 1 local
  components frame + 1 notes frame**. The shipped screen was the INPUT; the frame is now the
  measure.

  **One screen, four sub-tabs — not four screens.** For You / Following / Explore / Community are a
  `useState` in `CommunityScreen.tsx`; `ExploreScreen.tsx` and `CommunityHubScreen.tsx` render as
  PANELS inside the same `ScrollView`, under the same app bar and bottom nav. So the nav gets one
  screen entry with four populated frames. `Tab Strip 517:1574` already ships exactly those four
  variant values and is the spine.

  **Frames.** `community — For You (populated)` **949:13725** ·
  `— Following (populated)` **949:13986** · `— Following · empty feed` **949:14208** ·
  `— Explore (populated)` **949:14813** · `— Community Hub (populated)` **952:2156** ·
  `— Community Hub · search no match` **952:13223** ·
  `— For You · DARK PROOF` **952:13431** (pinned Colors→Dark, `197:0`; pin is on that frame only).
  `Local Components — community` **949:10486** · `community — design notes` **954:13409**.
  All 393 wide. Zero unbound solid paints across all seven frames — the dark proof flips whole.

  **Anatomy, all instanced.** `Patient AppBar 741:887` (`Back=Hidden`) and
  `Patient BottomTabBar 740:1015` (`Active=Community`) on every frame · `Tab Strip 517:1574` +
  `Tab 517:1513` ×4 · `Section Header 517:689` ×6 (the code hand-rolled six title+"View All" rows) ·
  `IconTile 517:1515` every glyph plate (48/Tint group cards + My Groups, 56/Tint Discover rows,
  32/Tint post callout) · `ChoiceChip 11:104` (6 topics, 4 categories) · `SearchField 396:538` ·
  `Avatar 550:1964` (40 authors, 56 specialists, 40 member stack) · `EmptyState 517:1773`
  (`Container=Card, Action=No`) all three empty branches · `Button 1:89` the Discover CTA.

  **Built locally, with why.** `GroupCard / Suggested 949:10511` (`Membership=Join|Joined`) ·
  `PostCard 949:11871` (`Content=Media|Callout|Plain`) · `PostActionBar 949:11489`
  (`Liked × Bookmarked` — four variants because the code has two independent local toggles per
  post) · `SpecialistCard / Compact 949:12347` (`Follow=Follow|Following`) ·
  `HubGroupCard / Joined 949:13090` (`Unread=Yes|No`) · `HubGroupRow / Discover 949:13091`.
  `Card / Form 435:503` covers none of them: the feed post and the suggested-community card are
  edge-to-edge (media band and action bar bleed to the border) where `Card / Form` insets
  everything by 32, and the My Groups card is itself the tap target.
  — **Two promotion proposals, deliberately NOT acted on** (§5c forbids editing the Design System
  page mid-claim): (1) `SpecialistCard 413:677` on Find Care is a fixed 361dp full-width profile
  card; it wants a `Layout=Full|Compact` axis rather than a second definition. (2) `Button 1:89` is
  a 345×56 full-width control with no compact size, so the five 44pt action pills (Join, Follow,
  Profile, Join Community, View Details) are local; it wants a `Size` axis.

  **Glyphs added to `Icons 24 — shared 517:2096`** — 14 new 24px components, bound to
  `color/on-surface-variant`, matching the existing chrome convention: `icon/chrome-check`
  **949:10253**, `icon/chrome-verified` **949:10257**, `icon/chrome-more-vert` **949:10260**,
  `icon/chrome-comment` **949:10263**, `icon/chrome-share` **949:10269**, `icon/chrome-bookmark`
  **949:10272**, `icon/chrome-bookmark-filled` **949:10275**, `icon/chrome-person-add`
  **949:10324**, `icon/chrome-article` **949:10328**, `icon/heart-filled` **949:10331**,
  `icon/physical-activity` **949:10334**, `icon/mental-health` **949:10339**,
  `icon/blood-glucose` **949:10343**, `icon/recovery` **949:10347**. Reused rather than added:
  `icon/nutrition-24 530:812`, `icon/heart-rate-24 530:809`, `icon/heart 528:830`,
  `icon/info 517:1778`, `icon/group 550:1887`, `icon/camera 528:842`,
  `icon/person-search 915:9737`.

  **Defect found in a SHARED component, and fixed.** `IconTile 517:1515` — the three `Size=48`
  variants (`526:800` Tint, `526:805` Accent, `526:810` Neutral) had
  `componentPropertyReferences = {}` on their glyph child where the 32/40/56 variants all carry
  `{ mainComponent: "Glyph#517:8" }`. Property read, not inferred: setting the Glyph swap on a
  `Size=48` instance recorded the value and rendered `icon/calendar-add` anyway. Now wired on all
  twelve variants; verified. No existing instance changes, because the default value is unchanged.

  **Content-drift defect caught in my own delivery, and fixed.** All eight `PostActionBar`
  instances carried the component's default `342 / 48`, so three posts with different engagement
  read identically. Corrected at the `PostCard` variant level so every frame inherits one truth:
  `Content=Media` (Dr. Abena Owusu) 342/48, `Content=Callout` (Dr. Efua Asante) **89/12**,
  `Content=Plain` (Dr. Adjoa Boateng) **210/31** — matching `FEED_POSTS`. This is exactly the §5c
  step-2b failure mode, third round running; a shared component fixes structure and does nothing
  about content unless the canon is baked into the defaults.

  **360dp arithmetic** (measured, not asserted). Both horizontal strips are full-bleed at 393 with
  16/16 content insets, 240 cards and a 16 gap, so card 2 starts at x=272:
  at 360dp peek = 360−272 = **88 of 240 = 36.7%**; at 393dp = 121/240 = **50.4%**. One width, both
  devices, no branch; trailing inset 16. The group card got *wider*, not narrower — content
  240−2×24 = **192**, up from 152 at the old 200dp.
  `Top Specialists to Follow` now shares that pitch deliberately; the code shipped `w-64` (256dp)
  cards inside the gutter with no full-bleed and no trailing inset, peeking 360−288 = 72/256 =
  **28.1%**, below BRAND's floor — a second half-slice nobody had found.
  The Hub's Discover categories are four KNOWN chips, so BRAND's "prefer fitting" applies and the
  row **no longer scrolls**: measured hugs 128 / 96 / 127 / 92 wrap to row 1 = 232 and row 2 = 227,
  both inside the 328 content width at 360dp. Scrolling, "Mental Health" showed 112/127 = 88% — a
  near-complete item reading as whole, which BRAND rules out as explicitly as a sliver.

  **States NOT drawn, with reasons.** Loading (`SkeletonCard 517:2291`) and error
  (`ErrorPanel 517:2111`): none of the three files performs any I/O. `SUGGESTED_GROUPS`,
  `FEED_POSTS`, `HUB_GROUPS`, `SPECIALISTS`, `HERO` and `SUGGESTED_COMMUNITY` are module-level
  consts — no fetch, no `isLoading`, no error, no offline branch, so there is no state to frame.
  The code names its future endpoints in comments (`GET /v1/community/memberships`,
  `?feed=following`, the follow graph); when any lands, this screen needs a `SkeletonCard`
  reserving the exact `PostCard` height plus an `ErrorPanel`, and that is a design task for the
  round that adds the query, not a guess now. Also not drawn as screen frames: Explore's
  `Follow=Following` and the group `Joined` states — per-item local toggles, not screen states, so
  they ship as component variants with one shown live (Holistic Nutrition is Joined because
  `joinedGroups` seeds `"g1"`).
  **Not used from §3, with reasons.** `Detail AppBar 193:120` (tab root, must not carry a back
  button) · `VitalStatCard 723:625` (nothing here is a clinical measurement) ·
  `KeyValueRow 517:1772` ("12.5k Members" is a caption, not a label/value pair — forcing it would
  invent a label the copy does not have).

  — **Required work for the Build round** (§5c step 7; every item is a place the code is wrong and
  the frame is now right):
  1. **16 hardcoded hex sites in `CommunityScreen.tsx`** (18 literals — lines 616 and 647 carry two
     each): lines 154, 155, 163, 164, 172, 173, 505, 541, 553, 578, 590, 616×2, 625, 635, 647×2,
     667. Plus **7 live in `CommunityHubScreen.tsx`** (79, 89, 98, 108, 208, 306, 344 — an 8th
     `#3d4947` at 176 is quoted inside a comment) and **2 in `ExploreScreen.tsx`** (296, 360).
     Every one resolves to a variable in these frames. Note `#0058be` (Hub line 89) is a **blue in
     no token at all** — the same stray literal the scripts & meds round flagged; it needs a token
     decision, not a nearest-match substitution.
  2. **All three files import `MaterialIcons` directly** — 11 JSX sites + 1 type reference in
     `CommunityScreen`, 5 in the Hub, 2 in Explore. BRAND:
     `src/components/ui/icons/Icon.tsx` is the ONLY file permitted to import an icon library.
     The 14 glyphs above are the registry entries this needs.
  3. **Invented clinicians.** `Dr. Sarah Jenkins`, `Dr. Elena Ross` (`CommunityScreen`);
     `Dr. Elena Rossi`, `Dr. Marcus Chen`, `Dr. Sarah Luvon` (`ExploreScreen`); and
     `"Marcus Chen, RN"`. None exists in `scripts/seed_dev_data.py`. The frames use the seeded
     clinicians — **Dr. Abena Owusu** (Nutrition & Dietetics), **Dr. Efua Asante** (Paediatrics),
     **Dr. Adjoa Boateng** (Cardiology), **Dr. Nii Tetteh** (Mental Health) — the same rule the
     Provider Profile round already applied.
  4. **Three unrelated accent families used decoratively.** The group plates were
     `tertiary-container` / `primary-container` / `secondary-container` with three frozen foreground
     hexes plus a three-hex `LinearGradient` corner wash each. All now `IconTile Tone=Tint`; the
     groups are told apart by **glyph**. BRAND: colour "exists to communicate state, not to
     decorate".
  5. **Radii off the 4/12/24/full scale.** `PostCard` `rounded-[20px]`; the Explore hero and the
     suggested-community card `rounded-2xl` (16); several legacy `rounded-lg`/`xl`. All now
     `radius/12` or `radius/24`.
  6. **Type off the ramp via inline `fontSize`** — 24, 18, 16, 14, 10 and `fontWeight: "700"`
     across all three files. All now text styles. The 10sp `"+12k"` bubble was **below BRAND's 12sp
     floor** and is now `label-sm`.
  7. **Tap targets under 44pt.** The Join pill was `py-xs` (4) around a 12sp label ≈ 26pt;
     `more-vert` was `p-xs` + `hitSlop 6` ≈ 30pt; like / comment / share / bookmark had **no
     padding at all**. Every one is 44pt in the frames.
  8. **Hairlines drawn with a SURFACE token.** The post action bar used `border-surface-variant`,
     the My Groups footer `border-surface-variant/50`. BRAND's hairline token is `outline-variant`,
     at full strength.
  9. **Opacity used on accents and on text** — `bg-primary/10`, `bg-primary-container/10`,
     `border-primary/20`, `bg-primary/20`, `border-tertiary-fixed-dim/30`, `text-white/80`,
     `on-tertiary-fixed/80`, `bg-surface/90`. Resolved to real tokens (`primary-tint`,
     `surface-container`, `outline-variant`, `white`, `on-surface-variant`). An alpha on an accent
     is not a token and does not survive a mode flip.
  10. **Avatars with no fallback chain.** Post authors are a bare `<Image>` at 48 and specialists at
      64 — both off the `Avatar` ramp (40/56) and neither with the photo→initials→silhouette chain
      BRAND requires. Now `Avatar 550:1964` at 40 and 56.
  11. **The Discover row's 64px glyph plate is off the `IconTile` ramp** (32/40/48/56). Now 56.
  12. **`formatMembers` rounds badly when membership is bumped.** Joining "Holistic Nutrition"
      passes 12001, and `n % 1000 !== 0`, so the label becomes `"12.0k Members"` instead of
      `"12k Members"`. The frame shows `12k`; the helper must round before choosing its precision.
  13. **The Explore hero stacked a 3-stop transparent→black gradient under white text**, so
      contrast depended on where the copy landed over an arbitrary photograph. Replaced with a
      uniform `color/scrim` at 60% and full-strength `color/white` — measurable everywhere, and
      tokenised.
  14. **The specialist strip and the category row are both BRAND §"Horizontal strips and
      carousels" failures at 360dp** — see the arithmetic above. Neither is the strip the code had
      already fixed; the Suggested Groups fix was real and is preserved verbatim (240 / 16 / 16,
      36.7%).

  — *Claim stays open through Build and BuildReview per §5c.*

## 5w. **DONE 2026-08-06** — the chat_thread frame described the wrong conversation. PO ruled the FRAME wrong.

Raised by the PO: "the chat design doesn't match what is on figma." It did not, and the code had
already flagged why (`ChatThreadScreen.tsx` header, "THE FRAME AND THIS SCREEN ARE NOT THE SAME
CONVERSATION"). `552:1376` drew a clinician GROUP room — "ICU Night Shift", "8 members · 3 online
now", per-message sender attribution, "Shift started · 19:00", "Nurse Jennifer joined the shift" —
on the route that serves the patient's 1:1 with their doctor.

**PO ruling: the frame was wrong.** The evidence supported it — `InboxScreen` pushes `?name=&role=`
as a 1:1; there are no messaging endpoints at all, so member count, presence and join events would
all have been fabricated; and the frame's cast was invented.

### `552:1376` is now the patient↔doctor 1:1
Title → `Dr. Adjoa Boateng`, context bar → `Doctor · Cardiologist` / `Online now`, divider →
`Today`, composer → `Type a message…`. Sender attribution is off, and the whole thread was rewritten
— it had been clinician handover talk about "Patient-8821", i.e. the patient reading about
themselves in the third person.

### `practitioner_chat — care team thread` is new, on Practitioner Shell
`1057:1448` (light) and `1059:17684` (DARK proof, pinned). The group design was **recovered, not
redrawn** — it was good work filed against the wrong route. Measured 223.5 → 53.3 mean luminance,
83.9% light → 81.4% dark, colours 983 → 1001.

### Two library-level defects fixed on the way
1. **`Chat Bubble / Other` (`550:2013`) shipped `"Dr. Sarah Chen · Attending Physician"` as the
   DEFAULT of its `Sender#550:8` property.** Every future instance would inherit an invented name.
   This is the third occurrence of that defect (booking's "Dr. Sarah Jenkins", the Account Menu's
   "Akosua Mensah"). Default is now `Dr. Kwabena Osei · Attending Physician`, from the seeded roster.
2. **Sender was being switched with a raw `visible = false` on the text node instead of the
   component's `Show sender#550:11` boolean.** An instance does not expose invisible children, so
   the node did not survive duplication at all — cloning the frame produced a bubble with no Sender
   to restore. Both frames now use the property.

**Practitioner chat was entirely undesigned before this** — Practitioner Shell held only home and
profile, and the practitioner Inbox tab points at the shared `/(app)/inbox`. PO asked for design
then build; the build is the next entry.

## 5y. **FOR REVIEW 2026-08-06** — the account popover becomes a full Settings page

Requested by the PO. It also closes a defect `AccountMenu.tsx` had already flagged against
itself: *"at 393 a 320 panel leaves 57dp of scrim and reads as a menu. At 360 it leaves 24dp and
reads as a sheet. Same component, two different affordances… Either the selector gets a compact
variant or this becomes a real bottom sheet — that is a design call, and the plain build below is
the interim."* A full page is the third answer, and it removes the arithmetic entirely: the
`AppearanceSelector` needs 298dp of intrinsic width and now gets 361, so the `PANEL_PAD = 4`
hack and the `MENU_MAX_WIDTH` clamp both stop being load-bearing.

Frames on page `945:5796` (Account Menu):

| Frame | id |
| --- | --- |
| `settings — full page (replaces avatar popover)` | `1047:1427` |
| `settings — full page · DARK proof (pinned Colors/Dark)` | `1048:17523` |

Everything is instanced, not redrawn: `Detail AppBar` `193:120`, `Section Header` `517:689` ×2,
`AppearanceSelector` `949:10205`, `icon/chrome-arrow-right` `1002:890`. Every fill is a bound
token.

**Verified by measurement:** light 243.9 mean / 96.8% light px → dark 27.7 / 96.1% dark px, with
distinct colours holding at 594 → 617 (the guard against a flat dark slab).

**Two defects caught in the first render and fixed:**
- The `Detail AppBar` ships a trailing **share** action. Settings is a leaf reached from the
  avatar with nothing to share — an icon that looks live and does nothing is the class of thing
  the tooltip pass existed to remove. Hidden on the instance; the component exposes no property
  for it.
- The chevron was painted white-on-white and rendered as nothing. Rebound to `on-surface-variant`.

**Scope, stated plainly.** The page carries exactly what the popover carried — identity/Profile,
Appearance, Sign out — and nothing invented. A real settings page would normally also hold
Notifications, Privacy & Security, Language and About; none of those screens or preferences exist,
so adding rows would have designed promises the app cannot keep. The page has obvious room for
them when they land.

**Deliberate change from the popover:** Sign out is a centred `error`-toned row on its own card
(the iOS-Settings shape), not a filled red slab. The filled destructive treatment stays on the
CONFIRM dialog, which is unchanged and still the second of the two guards — this row only opens it.

**BUILT 2026-08-06** (this section was "NOT BUILT" for one commit). See §5x below.

## 5x. **DONE 2026-08-06** — Settings page built, and the patient avatar now navigates

Files: `src/features/settings/SettingsScreen.tsx`, `src/app/(app)/settings.tsx`,
`src/features/settings/__tests__/SettingsScreen.test.tsx`, plus `PatientShell` and its suite.

**The behavioural change, stated plainly:** `PatientShell` no longer mounts `<AccountMenu />`. The
avatar calls `router.navigate(SETTINGS_HREF)`. `navigate`, not `push` — the same dedupe the menu's
Profile row used, so a double tap cannot stack two copies of Settings. `avatarExpanded` is gone
from the bar call: the avatar opens a screen, and announcing `expanded: false` for it would be a
false disclosure.

**`AccountMenu` is NOT deleted, and that is the point.** Both `SettingsScreen` and
`PractitionerProfileScreen` mount it with `initialView="confirm-sign-out"` / `profileHref={null}`.
The confirmation copy, the cancel-first button order and the `router.replace`-before-`signOut()`
ordering therefore still live in exactly one file. A hand-rolled second confirm dialog on the
settings page would have been a second sign-out flow to keep in step with the rules that component
exists to enforce.

**Coverage moved with the behaviour rather than being deleted.** Five popover cases in
`PatientShell.test.tsx` became navigation cases; the assertions that actually mattered — sign-out
is reachable, sign-out is confirmed, the profile route is not orphaned, the appearance control has
a home — are now in `SettingsScreen.test.tsx`. Those four exist because each names a defect that
was real before the account menu landed.

`npx tsc --noEmit` clean. **73 suites / 959 tests pass.**

**NOT VERIFIED ON DEVICE.** The Itel is mid-onboarding (a cold start dropped it into the flow and
step 2 requires a date of birth, which is the user's to enter). Everything above is verified by
type-check and suite only; the screen has not been seen rendering on hardware.

**Deliberately not built:** Notifications, Privacy & Security, Language, About. None of those
screens or preferences exist, so a row for any of them would be a designed promise the product
cannot keep — the same defect class as the dead avatar this change fixed.

## 5z. **DONE 2026-08-06** — dark proofs for the three Patient Home frames, and the 36 unflippable paints they exposed

Page `74:102` held seven frames but only ONE dark pin (`overview — Dark proof`, `949:13208`).
Three dark proofs now exist, each pinned to `Colors/Dark` via
`setExplicitVariableModeForCollection("VariableCollectionId:1:2", "197:0")`:

| Proof | id | source |
| --- | --- | --- |
| `patient_home_active_care_focus — Dark proof` | `1042:1903` | `93:102` |
| `Patient Home / New User Onboarding — Dark proof` | `1045:2176` | `82:105` |
| `Patient Home / Patient Dashboard — Dark proof` | `1042:2092` | `110:244` |

**The proof paid for itself on the first measurement.** Onboarding did not flip: mean luminance
141.4 with **43.5% of pixels still light**, against a clean sibling's 42.6 / 91.4% dark. An audit
of every VISIBLE solid paint found why — `82:105` carried **36 hardcoded paints with no bound
variable**, which no mode can move:

- 18 white FRAME fills (`Hero`, `QuickActions`, `BentoRow`, `Tips`, `Header`, `VitalsStack`,
  the `ChecklistItem`s and the `TipTile` wrappers) → `color/surface`
- 14 white glyph strokes → `color/on-primary` (they sit on filled teal chips, confirmed from the
  rendered light frame, NOT inferred from node names)
- 2 `#BA1A1A` alert strokes → `color/error`
- `ProgressTrack` `#BCC9C6` → `color/outline-variant`, `ProgressFill` `#008378` → `color/primary`

The other two frames audited clean (0 unbound of 124 and 113), which is why only one of the three
misbehaved. The stale proof cloned before the fix was deleted and re-cloned from the corrected
source — hence the new id `1045:2176`.

**Verified by pixel measurement, not by eye**, per the standard set by the lifestyle pair; "it
looks dark" is exactly what the opaque-scrim defect also looked like.

| Frame | light mean | dark mean | dark px | distinct colours |
| --- | --- | --- | --- | --- |
| Onboarding, **before** | 235.3 | 141.4 ❌ | 44.9% | 1272 |
| Onboarding, **after** | 232.7 | **42.2** | 87.3% | 974 |
| active_care_focus | — | **47.7** | 70.3% | 1459 |
| Patient Dashboard | — | **46.3** | 82.7% | 2659 |

Light mode is unharmed (235.3 → 232.7; the drift is `color/surface` and the two progress tokens
resolving a hair off pure white, not a visual change). The distinct-colour counts are the guard
against the flat-slab failure: a frame covered by an opaque dark rectangle measures dark AND
collapses to a handful of colours. These do not.

**One judgement call to flag, not a defect I fixed:** in dark mode the Emergency chip reads as a
solid saturated red circle, where light mode shows a pale container with a red glyph. That is what
`color/error` / `color/error-container` resolve to in the dark ramp — a token-ramp decision, not a
frame decision. Raise it with the PO if the emphasis is wrong.

**Still true after this change:** these three frames all belong to ONE tab. `82:105` has never been
built and has no route; `110:244` has been orphaned since July. The dark proofs do not resolve that
— see the open item above.

## 5b. ~~OPEN TASK~~ **DONE 2026-08-01, gate ACCEPTED** — the trailing-eye defect

> Kept for the reasoning, not as a work item. The fix landed and passed the gate; the residual
> follow-ups (the slot rename, the missing password exemplar, the DOB/blood-type inconsistency,
> and `Login — no biometric enrolled 765:696`, which was REJECTED) are in the 2026-08-01 gate
> entry in §5 above. **Do not re-run this task.**

This began as "the Login frame has an eye icon on the email field." I audited all 18 `Input`
instances in the file before writing it up, and it is **not one frame's mistake — it is a wrong
default, plus a documentation exemplar that teaches the wrong default.** Fix the cause, not the
three symptoms.

**The component is already correct.** `Input` `1:52` exposes exactly the right control:

```
Show Trailing Icon#9:4   BOOLEAN        defaultValue: true     <-- the bug
Trailing Icon#9:8        INSTANCE_SWAP  defaultValue: 9:34 (icon/chrome-eye)
Icon#9:0                 INSTANCE_SWAP  defaultValue: 9:25
State                    VARIANT        Default | Focused | Error
```

Nobody has to build an axis. The default is simply backwards: **most fields are not passwords**,
so every instance is born with a show/hide eye and only the person who remembers turns it off.
That is why this keeps reappearing in new frames — and it will keep reappearing after you fix the
three instances below unless the default changes.

**Do this:**

1. **Flip `Show Trailing Icon` to default `false` on `1:52`.** Then re-check the instances that
   legitimately want it — the four password fields listed below already set it explicitly, so they
   should be unaffected; confirm with a screenshot rather than assuming.
2. **Fix the three wrong instances:**
   - `57:115` "Email Input" on `Login` `57:102` — an email field with a password toggle. The
     original report.
   - `326:719` "Input / Blood Type" on `sign_up_personal_details`, and its state-gallery twin
     `329:781` "Input / Blood Type — Focused". **This one is new and is worse than the email
     case:** placeholder "Select type" means it is a picker, so the eye is not merely useless, it
     sits exactly where the disclosure chevron belongs and tells the user the wrong control is
     there. Give it a chevron via `Trailing Icon#9:8`, don't just hide the eye.
3. **Fix the exemplar.** `435:485` "Field" inside the `Form — canonical treatment` section
   `435:1169` on the Design System page shows the eye with placeholder "Placeholder text". The
   canonical treatment is what everyone copies, so it is the transmission vector. It should show
   the neutral field; add a separate labelled password example beside it if the toggle needs
   documenting.

**Correct and to be left alone** (verified, do not "fix" these): `301:645` Password and `301:656`
Confirm Password on `sign_up_create_account`, and their gallery instances `302:830`, `302:842`,
`302:854`.

### The second Login defect — the biometric row has no unenrolled state

`Login` `57:102` draws `Biometric Row` `57:148` (`FaceID` `57:149` / `Fingerprint` `57:156`) and
the `OR CONTINUE WITH` divider `57:144` **unconditionally**. The running app hides all three
whenever the device has no enrolled biometric — `SignInScreen` gates on
`biometricCapability.deviceCapable`, meaning hardware **and** at least one enrolment.

**That is correct behaviour, not a bug to design away.** Offering a biometric tile on an
unenrolled device buys the user a guaranteed failure. But the frame has no state for it, so the
code had to invent one, and inventing states in code is precisely the drift this contract exists
to stop. Add the missing state as its own frame — `Login — no biometric enrolled` — and decide
the real question while you are there: does the divider go too (leaving the card ending at the
button), or does something take that space? Also worth designing: hardware present but nothing
enrolled is a case where a one-line "Set up Face ID in Settings" affordance may beat hiding the
row entirely. Your call — make it, and note it in §5.

Context worth having: this gate used to key off a stored refresh token, which was a genuine bug —
a fresh install or any post-sign-out session showed no biometric affordance at all, on the one
screen where a first-time user could ever discover the feature.

---

## 5a. ~~OPEN TASK~~ **DONE 2026-08-01, gate ACCEPTED** — `layout=Card|Row` on `VitalStatCard`

> Shipped as `VitalStatCard 723:625` with `layout=Card|Row` × `Tone=Normal|Abnormal`; `211:241`
> remains the default variant, and all instances survived undetached. The unused Tile variants
> were retired — correctly, the code has no `tile` consumer. **Do not re-run this task.** The
> spec below is kept because it is the reference for what Row must look like.

The **code side is already done and merged** (`src/components/ui/VitalStatCard.tsx`, 247 tests
green). Figma is now behind it, which is the wrong way round for a file where Figma is the
source of truth — so this is a catch-up, and the spec below is the shipped behaviour, not a
proposal. Match it rather than reinterpreting it; where you think it is wrong, say so in §5
instead of diverging.

**Why the axis exists.** `VitalStatCard` was built to end six private copies of "a labelled
clinical measurement" (one shipped `#171c1c`, a typo of `on-surface`). It deliberately exposes
no `className`/`style` — no escape hatch, no drift. But `PatientRecordScreen` needed a
horizontal line, had no legal way to get one, and wrote a **seventh** copy. The fix for "the
shared component cannot express my case" is a named axis decided once, not an escape hatch
that re-admits every other divergence with it.

**Add variant property `layout` with values `Card` and `Row`.** `Card` is the existing
`211:241` composition, unchanged — do not redraw it. `Row` is new:

| Part | Spec |
|---|---|
| Container | horizontal, `minHeight` **64**, padding-x **12**, gap **12**, items centred, `radius/12` |
| Container paint | **no fill**, 1px `color/outline-variant` hairline |
| Chip (optional) | 24×24 circle, fill `primary-container` (normal) / `error-container` (abnormal), glyph **14** in the matching `on-*-container` |
| Label | `body-md` (16) on `color/on-surface`, single line, truncates |
| Secondary line | glyph **14** + `label-sm` (12). Abnormal → `color/error`; otherwise the trend label on `color/on-surface-variant` |
| Value | `headline-md` (20), `color/on-surface` normal / `color/error` abnormal |
| Unit | `label-sm` (12) on `color/on-surface-variant`, baseline-aligned to the value, gap 4 |

**Three things to get right, each for a stated reason:**

1. **No fill on the container.** A row appears *inside* a card that is about something else, so
   it must be legal on any parent surface — the same "let the parent surface show through"
   treatment `ChoiceChip 11:104` settled on. Do not give it `card-surface`, and do not nest a
   `Card / Form`: a card inside a card is what the elevation rule exists to avoid.
2. **The abnormal state keeps its non-colour signal in Row.** Glyph *and* words, never a red
   value alone. BRAND "Colour rules" / WCAG 1.4.1. A layout axis must not become a way to opt
   out of that.
3. **No drop shadow**, per `elevation/card` being empty.

**Do NOT add a third value.** `ActivePatientRoster2Screen`'s `Metric` is a vertically-stacked
compact tile three-up in a strip — a different shape, not a narrow Row, and it is copy #8. It
may deserve `layout=Tile` later, but that should be designed against a frame first. Note
`SkeletonCard 517:2291` already has a `Shape=Stat tile` variant as precedent. Flag it in §5;
don't decide it in passing.

When done, record the variant node-ids in §5 so the code comments can cite them.

## 5c. PARALLEL FLOW PROTOCOL — both agents working at once, design **through build**

Adopted 2026-08-01 after a page-partitioned round ran clean (Codex on five pages, Claude on
`144:107`, zero collisions). This replaces the blanket "never both in Figma at once" lock.

### The two boundaries

**The page is the safe boundary.** One page, one owner, for the duration of a flow.

**The component is the dangerous one, and it crosses pages.** Editing a component while the
other agent is placing instances of it reshapes their work mid-draw. So:

- Never edit the **Design System page** while the other agent has an open flow claim.
- Need a new shared component mid-flow? Build it **local to your page**, in a
  `Local Components — <flow>` frame, and propose promotion in §5 afterwards. Promotion is a
  separate, deliberate act with its own review — never a side effect of building a screen.

### Claiming work

Before your first write, append to §5:

```
YYYY-MM-DD — <agent> — CLAIM <page id> "<page name>" for <flow>: <screen list>. Expected <n> frames.
```

Release it the same way when the flow passes its gate. If you need a page someone else holds,
ask in §5 and wait — do not "just fix one thing" on their page.

### The flow, in order

1. **Journey spec first, written, before any drawing.** What data flows between the screens;
   the anatomy of each screen naming the shared component and node id for every part; every
   state the code can actually produce (read the code, do not guess); the back/cancel/abandon
   story; the product rules that must not be dropped; and what you intend to change from the
   current code, with reasons.
2. **Serial component phase.** Build every shared piece the flow needs — *before any screen is
   drawn*, and by one agent, not several. **This is the rule the booking round paid for:** three
   agents drawing three screens in parallel each built their own practitioner summary row, and
   the flow ended up describing three different appointments with three different doctors. The
   duplication caused the divergence. One component means one place to be wrong.
3. **Then the screens.** Parallel is fine here, because the shared parts already exist.

   **2b. Set the canonical CONTENT as the component's default property values — and forbid screen
   agents from overriding identity fields.** A shared component stops *structural* drift. It does
   nothing about *content* drift, because every instance can override the text. Both flows so far
   failed on exactly this, in different disguises:
   - **booking** — three agents each built their own summary row (structure diverged, and content
     with it);
   - **scripts & meds** — the serial component phase worked, one `PrescriptionIdentityBlock` was
     instanced three times and never rebuilt… and the three instances still carried **two
     different drug identities and two different dosing regimens** for one prescription
     (`828:5739` "Take 1 tablet with your evening meal" vs `828:5985` "Take 1 tablet with
     breakfast and dinner").

   So the component phase must also decide the canon and bake it in as defaults. Screen agents
   inherit; they may override *presentational* switches (`Show rating`, `Surface`) but never the
   identity fields — name, dose, date, practitioner, reference. If a screen genuinely needs a
   different value, that is a spec question, not an override.

   On a clinical screen this is a safety rule, not a tidiness rule. Two dosing regimens for one
   prescription is the kind of defect that hurts someone.
4. **States.** A screen designed only in its happy, fully-populated state is how loading, empty,
   error and offline get invented per-PR later. Use `EmptyState 517:1773`,
   `ErrorPanel 517:2111`, `SkeletonCard 517:2291`. A skeleton must reserve the **exact** height
   of what it replaces — a mismatch causes the layout shift the skeleton exists to prevent.
5. **One dark proof per screen**, pinned with `setExplicitVariableModeForCollection`. It is also
   your raw-hex detector: a layer that will not flip was never tokenised.
6. **Verify by screenshot.** `get_screenshot` every frame and look at it. This file's metadata
   has lied — stale names, positions that do not match the render. Coordinates are not evidence.
7. **Report** in §5: node id and name per frame, which shared component renders each part, what
   you had to build locally and why nothing existing covered it, states you did *not* frame with
   the reason, and everything you deliberately changed from the code — that last list becomes
   required work in the code round, so do not include preferences you cannot defend.

### 8–9. Build, then BuildReview — **a flow is NOT done at the design gate**

The project's pipeline is six stages: Research → Synthesis → Design → DesignReview → **Build →
BuildReview**. Steps 1–7 above are stages 1–4. **Stages 5–6 are part of the same flow claim and
you do not release the claim without them.**

This is written down because it went wrong. Several rounds in a row stopped at the design gate;
frames landed and no code was reconciled against them, so the approved design and the running app
drifted apart while every round reported success. A frame nobody builds against is a picture.

**Build.** Reconcile the code to the frames. Figma is the source of truth for **appearance**; the
code is the source of truth for **behaviour**. Where they disagree on appearance, the frame wins.
Behaviour is preserved unless the design explicitly and defensibly changed it — and the changes
your design phase recorded in §5 (step 7 above) are **required work, not a wish list**. Same
component discipline as the design side: build the shared code components first, alone, in
`src/components/ui/`, before three agents touch three screens. The failure mode is identical and
it has already happened on both sides of the line.

**BuildReview.** Verify each recorded change is actually implemented, quoting the code; verify
each state frame has a real branch behind it; diff every touched file against `HEAD` and name
anything dropped that no report flagged. Two things a green suite will not prove and that a
reviewer must reason about from the code: navigation behaviour (hardware back, `dismissAll`,
rehydrating params) and keyboard avoidance.

**Never ship fabricated data as real.** A hardcoded booking reference, patient id or clinician
name on a confirmation screen is worse than an absent one — render the row only when the value
exists.

### Definition of done

§7 applies unchanged. Plus, for a parallel flow:

- **The screens must describe one story.** Put them side by side and read them. If screen 2 cannot
  be traced back to a choice made on screen 1, the flow fails no matter how good each frame is on
  its own.
- **The flow is built and BuildReview passed.** Then release the page claim in §5 — a claim
  released at the design gate leaves work nobody owns.

### Reporting a defect in the other agent's work

State the **property you read**, not the conclusion you drew. "Wired to nothing" is a
conclusion; `componentPropertyReferences = {}` is evidence. On 2026-08-01 three gate agents
produced four confident, node-id-bearing findings that were all false, and they were persuasive
*because* they were specific. Anything that would send the other agent into a rebuild gets
hand-verified before it is written into §5.

---

## 6. Traps that have already cost time

Every one of these has happened at least once on this project.

- **The wrong `on-` pair.** Text or icons on an accent must use that accent's `on-` token. A
  *tinted* surface takes the surface's pair (`on-surface-variant`), never the accent at full
  strength. This shipped three times as illegible dark mode.
- **Designing only light mode.** Verify by cloning the frame, pinning the *clone* to
  `Colors/Dark`, screenshotting, then deleting the clone. Never leave a mode pin on delivered
  work.
- **Cards with drop shadows.** Cards cast none — separation is surface tone plus a 1px
  `outline-variant` hairline. Only sheets, menus, dialogs, toasts and FABs may use
  `elevation/floating`.
- **A new component beside surviving loose copies.** That is a *second* definition, which is
  worse than one bad definition. Replace the loose frames on delivered screens with instances;
  gallery copies may stay as documentation, annotated.
- **Reporting a census from memory.** Count programmatically. A round failed review for
  claiming "5 total / 5 replaced / 0 left" when the real total was 8.
- **Leaving `TEMP` scaffolding behind.** Delete preview and audit clones in the same script
  that creates them, and verify afterwards.
- **Auto-layout ignoring manual x/y** unless `layoutPositioning = 'ABSOLUTE'`. Verify with a
  screenshot, never coordinates.
- **`resize()` on a VECTOR after assigning `vectorPaths`** distorts the geometry. Import real
  SVG geometry at the size you need.
- **`get_metadata` returning a stale page list.** It once reported 2 pages when the file had 7.
  Cross-check with a live `use_figma` read.
- **Metro dies on file change** (`react-native-css-interop` → `Cannot read properties of
  undefined (reading 'addedFiles')`). The dev server and file-writing agents cannot run
  together. Stop Metro before a build round; restart after.
- **One agent, too much scope.** An audit over 25 screens, a migration over 20, and a review
  over everything each died from context exhaustion and retried invisibly for ~25 minutes.
  Partition the work and give each slice a bounded surface.

---

## 7. Definition of done, per screen

1. A Figma frame at **393px**, both modes verified, no stray mode pin.
2. Every shared element **instanced**, not hand-drawn — anything invented is named in the report.
3. **Async states** designed (empty / loading / error) where the screen talks to a backend.
4. Code matches the frame, with every colour through a token and every glyph through `<Icon />`.
5. `npx tsc --noEmit` clean and `npx jest` green.
6. Any behaviour the frame cannot express is **flagged**, never silently dropped.

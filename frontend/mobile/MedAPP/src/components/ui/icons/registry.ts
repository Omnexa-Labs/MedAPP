// Health Icons registry — the ONLY place icon SVGs are imported.
//
// Why a registry instead of letting screens import SVG paths directly:
//   - deep paths like "healthicons/public/icons/svg/outline/body/heart_organ.svg"
//     are fragile and leak vendor structure into 80+ screens
//   - it keeps the icon vocabulary reviewable — one file shows every icon the
//     product uses, so two screens can't ship different glyphs for "medication"
//   - Metro only bundles what's referenced here, so the 690-icon package
//     doesn't bloat the app (bandwidth matters for our target markets)
//
// Health Icons (https://healthicons.org) is MIT/public-domain, purpose-built for
// global health, and is the project's DOMAIN icon set. It deliberately contains
// no UI chrome (no chevron/bell/share/sun) — see docs/BRAND.md for what covers
// that. Add a new entry here (verify the path exists in node_modules first)
// rather than reaching for another library.
//
// All names use the "outline" weight for consistency; switch a single entry to
// "filled" only if the design calls for a solid state (e.g. an active tab).

import type * as React from "react";
import type { SvgProps } from "react-native-svg";

// --- Body / anatomy ---------------------------------------------------------
import Heart from "healthicons/public/icons/svg/outline/body/heart_organ.svg";
import Lungs from "healthicons/public/icons/svg/outline/body/lungs.svg";
import Kidneys from "healthicons/public/icons/svg/outline/body/kidneys.svg";
import Liver from "healthicons/public/icons/svg/outline/body/liver.svg";
import Brain from "healthicons/public/icons/svg/outline/body/neurology.svg";
import Eye from "healthicons/public/icons/svg/outline/body/eye.svg";
import Tooth from "healthicons/public/icons/svg/outline/body/tooth.svg";
import Joints from "healthicons/public/icons/svg/outline/body/joints.svg";

// --- Vitals / diagnostics / devices ----------------------------------------
import BloodPressure from "healthicons/public/icons/svg/outline/devices/blood_pressure.svg";
import Cardiogram from "healthicons/public/icons/svg/outline/symbols/heart_cardiogram.svg";
import PulseOximeter from "healthicons/public/icons/svg/outline/devices/pulse_oximeter.svg";
import Thermometer from "healthicons/public/icons/svg/outline/devices/thermometer.svg";
import Weight from "healthicons/public/icons/svg/outline/devices/weight.svg";
import Stethoscope from "healthicons/public/icons/svg/outline/devices/stethoscope.svg";
import Microscope from "healthicons/public/icons/svg/outline/devices/microscope.svg";
import TestTubes from "healthicons/public/icons/svg/outline/devices/test_tubes.svg";
import BloodBag from "healthicons/public/icons/svg/outline/blood/blood_bag.svg";
import Syringe from "healthicons/public/icons/svg/outline/devices/syringe.svg";
import Vaccine from "healthicons/public/icons/svg/outline/devices/syringe-vaccine.svg";
import UrineSample from "healthicons/public/icons/svg/outline/devices/urine_sample.svg";
import Wheelchair from "healthicons/public/icons/svg/outline/devices/wheelchair.svg";
import Mobile from "healthicons/public/icons/svg/outline/devices/mobile.svg";

// --- Medications / prescriptions -------------------------------------------
import Pill from "healthicons/public/icons/svg/outline/medications/pill_1.svg";
import Pills from "healthicons/public/icons/svg/outline/medications/pills_4.svg";
import MedicineBottle from "healthicons/public/icons/svg/outline/devices/medicine_bottle.svg";
import Prescription from "healthicons/public/icons/svg/outline/objects/prescription_document.svg";
import Certificate from "healthicons/public/icons/svg/outline/objects/i_certificate_paper.svg";

// --- People / providers -----------------------------------------------------
import Doctor from "healthicons/public/icons/svg/outline/people/doctor.svg";
import Nurse from "healthicons/public/icons/svg/outline/people/nurse.svg";
import People from "healthicons/public/icons/svg/outline/people/people.svg";
import Pregnant from "healthicons/public/icons/svg/outline/people/pregnant.svg";

// --- Places / logistics -----------------------------------------------------
import Hospital from "healthicons/public/icons/svg/outline/places/hospital.svg";
import AmbulatoryClinic from "healthicons/public/icons/svg/outline/places/ambulatory_clinic.svg";
import Home from "healthicons/public/icons/svg/outline/places/home.svg";
import Ambulance from "healthicons/public/icons/svg/outline/vehicles/ambulance.svg";

// --- Lifestyle --------------------------------------------------------------
import Nutrition from "healthicons/public/icons/svg/outline/nutrition/nutrition.svg";
import Fruits from "healthicons/public/icons/svg/outline/nutrition/fruits.svg";
import Running from "healthicons/public/icons/svg/outline/exercise/running.svg";
import Walking from "healthicons/public/icons/svg/outline/exercise/walking.svg";
import Swim from "healthicons/public/icons/svg/outline/exercise/swim.svg";
import Sleepy from "healthicons/public/icons/svg/outline/emotions/sleepy.svg";

// --- Mood scale --------------------------------------------------------------
// A 5-point self-reported mood scale, replacing the emoji the lifestyle screens
// used to render as text. BRAND.md is absolute on this ("No emojis, ever"), and
// an emoji is also unstyleable — it can't take a token colour, and it renders
// as whatever glyph the OS ships, which differs per device.
//
// DESIGN ADVISORY: the *vocabulary* here is a judgement call made to remove the
// emoji, not a designed decision. Health Icons has no ranked mood set, so these
// five faces were picked for being unambiguously ordered. `calm` as the top of
// the scale is the weakest link — for a health app "at ease" is a defensible
// best-case, but a designer should confirm it against `happy`.
import LoudlyCrying from "healthicons/public/icons/svg/outline/emotions/loudly_crying.svg";
import Sad from "healthicons/public/icons/svg/outline/emotions/sad.svg";
import NeutralFace from "healthicons/public/icons/svg/outline/emotions/neutral.svg";
import Happy from "healthicons/public/icons/svg/outline/emotions/happy.svg";
import Calm from "healthicons/public/icons/svg/outline/emotions/calm.svg";

// --- Misc symbols -----------------------------------------------------------
import Calendar from "healthicons/public/icons/svg/outline/objects/calendar.svg";
import Settings from "healthicons/public/icons/svg/outline/symbols/ui_settings.svg";
import Preferences from "healthicons/public/icons/svg/outline/symbols/ui_preferences.svg";
import Communication from "healthicons/public/icons/svg/outline/symbols/communication.svg";
import MenuGrid from "healthicons/public/icons/svg/outline/symbols/ui_menu_grid.svg";
import MedicalAdvice from "healthicons/public/icons/svg/outline/symbols/medical_advice.svg";
import Virus from "healthicons/public/icons/svg/outline/symbols/virus.svg";
import MagnifyingGlass from "healthicons/public/icons/svg/outline/symbols/magnifying_glass.svg";

// --- Security / privacy / trust ---------------------------------------------
// Used by the sign-up security step and the HIPAA trust badge. There is no
// "shield" glyph in Health Icons — reach for one of these instead of inventing
// a name the registry can't resolve.
import UiSecure from "healthicons/public/icons/svg/outline/symbols/ui_secure.svg";
import Fingerprint from "healthicons/public/icons/svg/outline/symbols/fingerprint.svg";
import SecureCommunication from "healthicons/public/icons/svg/outline/symbols/secure_communication.svg";
import HealthDataSecurity from "healthicons/public/icons/svg/outline/symbols/health_data_security.svg";
import HealthDataSync from "healthicons/public/icons/svg/outline/symbols/health_data_sync.svg";
import HealthWorker from "healthicons/public/icons/svg/outline/people/health_worker.svg";

/**
 * Semantic name -> Health Icons component. Names describe the *concept*, not
 * the picture, so a glyph can be swapped without touching call sites.
 */
export const HEALTH_ICONS = {
  // anatomy
  heart: Heart,
  lungs: Lungs,
  kidneys: Kidneys,
  liver: Liver,
  brain: Brain,
  eye: Eye,
  tooth: Tooth,
  joints: Joints,

  // vitals & diagnostics
  "blood-pressure": BloodPressure,
  "heart-rate": Cardiogram,
  "oxygen-saturation": PulseOximeter,
  temperature: Thermometer,
  weight: Weight,
  stethoscope: Stethoscope,
  microscope: Microscope,
  "lab-sample": TestTubes,
  "blood-bag": BloodBag,
  injection: Syringe,
  vaccine: Vaccine,
  "urine-sample": UrineSample,
  wheelchair: Wheelchair,
  device: Mobile,

  // medications
  medication: Pill,
  pills: Pills,
  "medicine-bottle": MedicineBottle,
  prescription: Prescription,
  // Professional credential / licence document — the partner-verification
  // vocabulary ("Verifying credentials & licensing").
  credential: Certificate,

  // people
  doctor: Doctor,
  nurse: Nurse,
  community: People,
  pregnancy: Pregnant,

  // places
  hospital: Hospital,
  // A clinic/practice as an *organisation* (partner onboarding, clinic
  // profile), distinct from `hospital` which is the building/facility.
  clinic: AmbulatoryClinic,
  home: Home,
  ambulance: Ambulance,

  // lifestyle
  nutrition: Nutrition,
  fruits: Fruits,
  running: Running,
  walking: Walking,
  swimming: Swim,
  sleep: Sleepy,

  // mood scale, worst -> best. Ordered deliberately: call sites index into this
  // sequence, so the order IS the scale.
  "mood-distressed": LoudlyCrying,
  "mood-low": Sad,
  "mood-neutral": NeutralFace,
  "mood-good": Happy,
  "mood-great": Calm,

  // security & privacy
  secure: UiSecure,
  fingerprint: Fingerprint,
  "secure-communication": SecureCommunication,
  "health-data-security": HealthDataSecurity,
  "health-data-sync": HealthDataSync,
  "health-worker": HealthWorker,

  // misc
  appointment: Calendar,
  // `calendar` is a deliberate second concept on the same glyph: `appointment`
  // means a booked visit, `calendar` means a bare date (e.g. "Last audit:
  // Jun 2026"). Two concepts sharing a glyph is fine; one concept with two
  // glyphs is the thing this registry exists to prevent.
  calendar: Calendar,
  settings: Settings,
  preferences: Preferences,
  message: Communication,
  // The patient shell's "Overview" tab (Figma `icon/overview` in 101:143) — the
  // at-a-glance health summary, not a menu. Named for the concept, per this
  // file's rule, even though the glyph is a grid; the bar used to draw
  // MaterialIcons `grid-view`, which is chrome for a set of tiles rather than a
  // name for what the tab shows.
  overview: MenuGrid,
  "medical-advice": MedicalAdvice,
  virus: Virus,
  search: MagnifyingGlass,
} satisfies Record<string, React.FC<SvgProps>>;

export type HealthIconName = keyof typeof HEALTH_ICONS;

import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

const params: { id?: string; state?: string } = {};
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => params,
  router: {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
}));
jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));
jest.mock("@expo/vector-icons", () => ({ MaterialIcons: () => null }));

import { router } from "expo-router";
import { TRIAGE_PATIENTS } from "@/features/roster2/mock-data";
import { PatientRecordScreen } from "../PatientRecordScreen";
import { findPatientRecord } from "../mock-data";

beforeEach(() => {
  delete params.id;
  delete params.state;
  jest.clearAllMocks();
});

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 393, height: 852 },
        insets: { top: 0, right: 0, bottom: 0, left: 0 },
      }}
    >
      <PatientRecordScreen />
    </SafeAreaProvider>,
  );
}

describe("PatientRecordScreen", () => {
  it("resolves every roster patient and the accepted intake", () => {
    for (const patient of TRIAGE_PATIENTS) {
      expect(findPatientRecord(patient.id)?.name).toBe(patient.name);
    }
    expect(findPatientRecord("marcus-chen")?.name).toBe("Marcus Chen");
  });

  it("matches the approved Amina identity and summary", () => {
    renderScreen();
    expect(screen.getByLabelText("Patient record").props.contentContainerStyle.gap).toBe(24);
    expect(screen.getByTestId("patient-summary-card").props.className).toContain("p-4");
    expect(screen.getByText("Amina Mensah, 46")).toBeTruthy();
    expect(screen.getByText("Ward 2A · ID PT-8821")).toBeTruthy();
    expect(screen.getByText("Needs review")).toBeTruthy();
    expect(screen.getByText("Reviewed 2h ago")).toBeTruthy();
    expect(
      screen.getByText(/Shortness of breath with a recent oxygen-saturation drop/),
    ).toBeTruthy();
  });
  it("renders a selected roster patient and a non-colour abnormal vital signal", () => {
    params.id = "adwoa-boateng";
    renderScreen();
    expect(screen.getByText("Patient record")).toBeTruthy();
    expect(screen.getByText("Adwoa Boateng, 61")).toBeTruthy();
    expect(screen.getByText("Above target")).toBeTruthy();
    // Sentence form, not the comma run-on the removed private `VitalRow` used:
    // the shared VitalStatCard builds ONE spoken summary
    // ("<label>, <value> <unit>. <abnormal>.") so a screen reader gets a reading
    // as a sentence rather than four disconnected fragments. Same content — the
    // separator is the only change, and it is the shared component's call.
    expect(screen.getByLabelText(/Blood pressure, 145\/92 mmHg\. Above target/)).toBeTruthy();
  });

  it("supports the accepted-intake patient fixture", () => {
    params.id = "marcus-chen";
    renderScreen();
    expect(screen.getByText("Marcus Chen, 59")).toBeTruthy();
    expect(screen.getByText(/Post-MI follow-up/)).toBeTruthy();
  });

  it("shows explicit not-found recovery and returns to the roster", () => {
    params.id = "missing-patient";
    renderScreen();
    expect(screen.getByText("Patient record unavailable")).toBeTruthy();
    expect(screen.getByTestId("not-found-card").props.style.height).toBe(220);
    expect(screen.getByTestId("not-found-card").props.className).toContain("w-full");
    fireEvent.press(screen.getByLabelText("Back to patient roster"));
    expect(router.replace).toHaveBeenCalledWith("/(app)/active-patient-roster-2");
  });

  it("disables every clinical action offline and retries", () => {
    params.state = "offline";
    renderScreen();
    expect(screen.getByText("You’re offline")).toBeTruthy();
    expect(
      screen.getByText("Showing saved clinical data from 09:42. Live actions are unavailable."),
    ).toBeTruthy();
    for (const label of [
      "Start video call",
      "Issue prescription",
      "Schedule follow-up",
      "Order lab tests",
      "Discharge patient",
    ]) {
      const action = screen.getByLabelText(label);
      expect(action.props.accessibilityState.disabled).toBe(true);
      if (label === "Start video call") {
        expect(action.props.style).toEqual({ opacity: 0.38 });
      } else {
        expect(action.props.style).toEqual({ height: 148, opacity: 0.38 });
      }
    }
    fireEvent.press(screen.getByLabelText("Try again"));
    expect(screen.queryByText("You’re offline")).toBeNull();
  });

  it("keeps the record useful when vitals are unavailable", () => {
    params.state = "vitals-unavailable";
    renderScreen();
    expect(screen.getByText("Live readings unavailable")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Reconnect"));
    expect(screen.getByText("Latest vitals")).toBeTruthy();
    expect(screen.getByText("Care timeline")).toBeTruthy();
  });

  it("shows accessible unavailable feedback for unwired actions", () => {
    renderScreen();
    fireEvent.press(screen.getByLabelText("Issue prescription"));
    expect(screen.getByText("Prescription workspace")).toBeTruthy();
    expect(screen.getByText(/No prescription has been issued/)).toBeTruthy();
  });

  it("routes video through the existing waiting room, as the practitioner", () => {
    renderScreen();
    fireEvent.press(screen.getByLabelText("Start video call"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/(app)/waiting-room",
      params: {
        appointmentId: "patient-amina-mensah",
        patientId: "amina-mensah",
        patientName: "Amina Mensah",
        providerId: "julian-sterling",
        providerName: "Dr. Julian Sterling",
        providerSpecialty: "Cardiologist",
        sessionId: "patient-amina-mensah",
        // The waiting room serves both sides of the call; this entry point is the
        // clinician's, so the role must travel with the route or the patient's
        // copy renders to the practitioner.
        viewerRole: "practitioner",
      },
    });
  });

  it("confirms discharge and returns from the saved terminal state", () => {
    renderScreen();
    fireEvent.press(screen.getByLabelText("Discharge patient"));
    expect(screen.getByText("Discharge Amina Mensah?")).toBeTruthy();
    expect(screen.getByText(/medication reconciliation and follow-up arrangements/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Confirm discharge"));
    expect(screen.getByText("Discharge saved")).toBeTruthy();
    expect(screen.getByTestId("discharge-saved-card").props.style.height).toBe(220);
    fireEvent.press(screen.getByLabelText("Back to patient roster"));
    expect(router.replace).toHaveBeenCalledWith("/(app)/active-patient-roster-2");
  });

  it("renders failed discharge with retry and cancel actions", () => {
    params.state = "discharge-failed";
    renderScreen();
    expect(screen.getByText("Couldn’t discharge patient")).toBeTruthy();
    expect(screen.getByLabelText("Try again")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Cancel"));
    expect(screen.queryByText("Couldn’t discharge patient")).toBeNull();
  });

  it("retries a failed discharge by reopening confirmation with record context", () => {
    params.state = "discharge-failed";
    renderScreen();
    fireEvent.press(screen.getByLabelText("Try again"));
    expect(screen.getByText("Discharge Amina Mensah?")).toBeTruthy();
    expect(screen.getByText("Amina Mensah, 46")).toBeTruthy();
  });

  it("renders loading state and uses a roster fallback for deep-link back", () => {
    params.state = "loading";
    (router.canGoBack as jest.Mock).mockReturnValue(false);
    renderScreen();
    expect(screen.getByLabelText("Loading patient record")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Go back"));
    expect(router.replace).toHaveBeenCalledWith("/(app)/active-patient-roster-2");
  });

  // This screen had FIVE SafeAreaViews and THREE StatusBars — the most in the
  // codebase — because each of its seven state branches wrapped itself. The
  // happy path passing is not evidence the other six moved onto the shell, so
  // every branch is enumerated here rather than sampled.
  describe("every state branch is on DetailShell", () => {
    const BRANCHES: readonly { name: string; id?: string; state?: string }[] = [
      { name: "ready" },
      { name: "loading", state: "loading" },
      { name: "offline", state: "offline" },
      { name: "not-found", id: "missing-patient" },
      { name: "vitals-unavailable", state: "vitals-unavailable" },
      { name: "discharge-saved", state: "discharge-saved" },
      { name: "discharge-failed", state: "discharge-failed" },
    ];

    it.each(BRANCHES)("$name renders exactly one shell header with a back button", (branch) => {
      if (branch.id) params.id = branch.id;
      if (branch.state) params.state = branch.state;
      renderScreen();
      // One back button == one app bar, from the shell. Two would mean a branch
      // kept its own bar; zero would mean a branch escaped the shell.
      expect(screen.getAllByLabelText("Go back")).toHaveLength(1);
      expect(screen.getByText("Patient record")).toBeTruthy();
      // A detail screen gets a back button INSTEAD of tabs — docs/BRAND.md
      // §App shell. No branch may render a tab set.
      for (const tab of ["Home", "Schedule", "Inbox", "Patients", "Profile"]) {
        expect(screen.queryByLabelText(tab)).toBeNull();
      }
    });
  });
});

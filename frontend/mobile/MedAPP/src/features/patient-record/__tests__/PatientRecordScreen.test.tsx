// The patient record, wired to `GET /v1/patients/{userId}/records`.
//
// Two cases here are the reason the file was rewritten, and both are about a
// failure being mistaken for a fact about a patient:
//
//   * A FAILED FETCH MUST RENDER AN ERROR, NOT NOT-FOUND. The screen used to
//     resolve `record` from a local lookup and render `NotFoundState` for any
//     falsy value, with `state` still `"ready"`. Wired to a query, that maps a
//     500 onto "This record may have moved, or you may not have permission to
//     view it" — a sentence about a patient, produced by a server fault.
//   * AN ABSENT ID MUST RENDER NOT-FOUND, NOT A DEFAULT PATIENT.
//     `DEFAULT_PATIENT_RECORD_ID = "amina-mensah"` meant a link with no id
//     opened one specific named person's chart.
//
// `deriveState` is asserted directly as well as through the render, because the
// render can only reach one branch at a time and the mapping is the invariant.

import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { renderWithSafeArea } from "@/test/safe-area";

const params: { id?: string } = {};
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

const mockGetBundle = jest.fn();
jest.mock("@/features/overview/api", () => ({
  ehrApi: { getBundle: (...a: unknown[]) => mockGetBundle(...a) },
}));

const mockUser: { id: string; displayName: string } | null = {
  id: "doc-1",
  displayName: "Dr. Adjoa Boateng",
};
jest.mock("@/hooks/use-current-user", () => ({ useCurrentUser: () => mockUser }));

import { router } from "expo-router";
import { ApiError } from "@/types/api";
import { PatientRecordScreen, deriveState } from "../PatientRecordScreen";

function renderScreen(): ReturnType<typeof renderWithSafeArea> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui: ReactElement = (
    <QueryClientProvider client={qc}>
      <PatientRecordScreen />
    </QueryClientProvider>
  );
  return renderWithSafeArea(ui);
}

const vital = (over: Record<string, unknown> = {}) => ({
  id: "v-1",
  patientId: "p-1",
  recordedByUserId: "doc-1",
  kind: "heart_rate",
  value: "76",
  unit: "bpm",
  recordedAtIso: new Date().toISOString(),
  note: null,
  ...over,
});

const bundle = (over: Record<string, unknown> = {}) => ({
  patient: { patientId: "p-1", userId: "u-1", displayName: "Ama Mensah" },
  vitals: [vital()],
  consents: [],
  ...over,
});

beforeEach(() => {
  delete params.id;
  jest.clearAllMocks();
  (router.canGoBack as jest.Mock).mockReturnValue(true);
  mockGetBundle.mockResolvedValue(bundle());
});

// ---------------------------------------------------------------------------
// The mapping
// ---------------------------------------------------------------------------

describe("deriveState", () => {
  const pending = { isPending: true, isError: false, error: null, data: undefined };

  it("maps NO ID to not-found, without a request and without a default patient", () => {
    // The old lookup fell back to "amina-mensah". A link that names nobody must
    // open nobody.
    expect(deriveState(undefined, pending)).toEqual({ kind: "not-found", reason: "no-id" });
  });

  it("maps a 500 to ERROR, never to not-found", () => {
    const state = deriveState("u-1", {
      isPending: false,
      isError: true,
      error: new ApiError("boom", 500),
      data: undefined,
    });
    expect(state).toEqual({ kind: "error", offline: false });
  });

  it("maps a network failure to ERROR, flagged offline", () => {
    const state = deriveState("u-1", {
      isPending: false,
      isError: true,
      error: new ApiError("down", 0),
      data: undefined,
    });
    expect(state).toEqual({ kind: "error", offline: true });
  });

  it("maps an explicit 404 — and ONLY a 404 — to not-found", () => {
    expect(deriveState("u-1", {
      isPending: false,
      isError: true,
      error: new ApiError("no such patient", 404),
      data: undefined,
    })).toEqual({ kind: "not-found", reason: "404" });
  });

  it("maps a 403 to its own state, not to not-found", () => {
    // "You may not view this" and "this does not exist" are different facts
    // about a patient. Folding them together is what let an outage read as a
    // missing record.
    expect(deriveState("u-1", {
      isPending: false,
      isError: true,
      error: new ApiError("forbidden", 403),
      data: undefined,
    })).toEqual({ kind: "forbidden" });
  });

  it("maps settled-with-no-data to error, not to not-found", () => {
    expect(
      deriveState("u-1", { isPending: false, isError: false, error: null, data: undefined }).kind,
    ).toBe("error");
  });

  it("maps a pending query to loading", () => {
    expect(deriveState("u-1", pending)).toEqual({ kind: "loading" });
  });
});

// ---------------------------------------------------------------------------
// The render
// ---------------------------------------------------------------------------

describe("PatientRecordScreen", () => {
  it("renders the record from the bundle", async () => {
    params.id = "u-1";
    renderScreen();
    await waitFor(() => expect(screen.getByText("Ama Mensah")).toBeTruthy());
    expect(mockGetBundle).toHaveBeenCalledWith("u-1");
    expect(screen.getByText("Patient ID p-1")).toBeTruthy();
  }, 20000);

  it("a failed fetch renders an ERROR, not not-found", async () => {
    params.id = "u-1";
    mockGetBundle.mockRejectedValue(new ApiError("boom", 500));
    renderScreen();

    await waitFor(() => expect(screen.getByTestId("record-error-card")).toBeTruthy());
    expect(screen.getByText("Couldn’t load this record")).toBeTruthy();
    // The sentence a naive wiring would have produced from a 500.
    expect(screen.queryByText("Patient record unavailable")).toBeNull();
    expect(screen.queryByText(/may have moved, or you may not have permission/)).toBeNull();
    expect(screen.queryByTestId("not-found-card")).toBeNull();
    // No clinical data behind the failure.
    expect(screen.queryByText("Ama Mensah")).toBeNull();
    expect(screen.queryByText("Latest vitals")).toBeNull();
  });

  it("an absent id renders not-found rather than a default patient's chart", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("not-found-card")).toBeTruthy());
    expect(screen.getByText("This link did not name a patient, so no record was opened.")).toBeTruthy();
    // No request was made at all — there is no id to make one with.
    expect(mockGetBundle).not.toHaveBeenCalled();
    // And nobody's record is on screen.
    expect(screen.queryByText("Ama Mensah")).toBeNull();
    expect(screen.queryByText("Amina Mensah")).toBeNull();
  });

  it("distinguishes no-access from no-record", async () => {
    params.id = "u-1";
    mockGetBundle.mockRejectedValue(new ApiError("forbidden", 403));
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("forbidden-card")).toBeTruthy());
    expect(screen.getByText("You do not have access")).toBeTruthy();
    expect(screen.queryByTestId("not-found-card")).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Vitals: the flag is COMPUTED
  // -------------------------------------------------------------------------
  it("flags an out-of-range vital the wire could not have flagged", async () => {
    params.id = "u-1";
    // `VitalOutWire` is {kind, value, unit} — no bounds, no `abnormal`. The
    // whole determination happens client-side, in vital-ranges.ts.
    mockGetBundle.mockResolvedValue(
      bundle({
        vitals: [vital({ id: "v-spo2", kind: "SpO2", value: "91", unit: "%" })],
      }),
    );
    renderScreen();

    await waitFor(() => expect(screen.getByText("Oxygen saturation")).toBeTruthy());
    // Non-colour signal, in words, naming the bound it fell outside.
    expect(screen.getByText(/Outside 94–100 %/)).toBeTruthy();
    expect(screen.getByLabelText(/Oxygen saturation, 91 %\. Outside 94–100 %/)).toBeTruthy();
  });

  it("does not flag an in-range vital", async () => {
    params.id = "u-1";
    mockGetBundle.mockResolvedValue(
      bundle({ vitals: [vital({ kind: "SpO2", value: "98", unit: "%" })] }),
    );
    renderScreen();
    await waitFor(() => expect(screen.getByText("Oxygen saturation")).toBeTruthy());
    expect(screen.queryByText(/Outside/)).toBeNull();
  });

  it("separates a reading it could not check from ones that passed", async () => {
    params.id = "u-1";
    mockGetBundle.mockResolvedValue(
      bundle({
        vitals: [
          vital({ id: "v-hr", kind: "heart_rate", value: "76", unit: "bpm" }),
          // No unit. Unclassifiable — and it must not sit beside a checked
          // reading as though it had passed the same check.
          vital({ id: "v-temp", kind: "temperature", value: "98.6", unit: null }),
        ],
      }),
    );
    renderScreen();

    await waitFor(() => expect(screen.getByText("Heart rate")).toBeTruthy());
    expect(screen.getByText("Not checked against a reference range")).toBeTruthy();
    expect(screen.getByText("Temperature")).toBeTruthy();
  });

  it("keeps a vital whose kind it does not recognise, under its own name", async () => {
    params.id = "u-1";
    mockGetBundle.mockResolvedValue(
      bundle({ vitals: [vital({ kind: "peak_flow", value: "410", unit: "L/min" })] }),
    );
    renderScreen();
    // Dropping it would silently lose an observation somebody recorded.
    await waitFor(() => expect(screen.getByText("peak_flow")).toBeTruthy());
    expect(screen.getByText("Not checked against a reference range")).toBeTruthy();
  });

  it("says nothing was recorded when the bundle carries no vitals", async () => {
    params.id = "u-1";
    mockGetBundle.mockResolvedValue(bundle({ vitals: [] }));
    renderScreen();
    await waitFor(() => expect(screen.getByText("No observations recorded")).toBeTruthy());
    // And no "Updated 2 min ago" — that literal is gone with the fixture.
    expect(screen.queryByText(/Updated/)).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------
  it("no clinical action reports success, including discharge", async () => {
    params.id = "u-1";
    renderScreen();
    await waitFor(() => expect(screen.getByLabelText("Discharge patient")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("Discharge patient"));

    // The old flow: a confirmation dialog, then "Discharge saved — removed from
    // the active roster." Nothing was sent and no roster changed.
    expect(screen.queryByText("Discharge saved")).toBeNull();
    expect(screen.queryByText(/removed from the active roster/)).toBeNull();
    expect(screen.queryByLabelText("Confirm discharge")).toBeNull();
    expect(screen.getByText(/No discharge has been recorded/)).toBeTruthy();
  });

  it("carries the SIGNED-IN clinician into the call, not a hardcoded name", async () => {
    params.id = "u-1";
    renderScreen();
    await waitFor(() => expect(screen.getByLabelText("Start video call")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("Start video call"));

    const call = (router.push as jest.Mock).mock.calls[0][0];
    expect(call.params.providerName).toBe("Dr. Adjoa Boateng");
    expect(call.params.providerId).toBe("doc-1");
    // The name that used to be pushed from every account, on every call.
    expect(call.params.providerName).not.toBe("Dr. Julian Sterling");
    expect(call.params.viewerRole).toBe("practitioner");
  });

  // -------------------------------------------------------------------------
  // Deleted fabrications stay deleted
  // -------------------------------------------------------------------------
  it("draws no field the bundle does not carry", async () => {
    params.id = "u-1";
    renderScreen();
    await waitFor(() => expect(screen.getByText("Ama Mensah")).toBeTruthy());

    // The bundle is patient + vitals + consents. Everything below came from the
    // deleted fixture.
    expect(screen.queryByText(/Ward/)).toBeNull();
    expect(screen.queryByText("Needs review")).toBeNull();
    expect(screen.queryByText("Care timeline")).toBeNull();
    expect(screen.queryByLabelText("View full history")).toBeNull();
    expect(screen.queryByText(/Dr Miller/)).toBeNull();
    expect(screen.queryByText(/Blood_Panel_V4/)).toBeNull();
    expect(screen.queryByText(/09:42/)).toBeNull();
  });

  it("is a detail screen: one shell bar, no tab set, on every state", async () => {
    for (const setup of [
      () => {
        params.id = "u-1";
      },
      () => {
        params.id = "u-1";
        mockGetBundle.mockRejectedValue(new ApiError("boom", 500));
      },
      () => {
        delete params.id;
      },
    ]) {
      jest.clearAllMocks();
      mockGetBundle.mockResolvedValue(bundle());
      delete params.id;
      setup();
      const tree = renderScreen();
      await waitFor(() => expect(screen.getAllByLabelText("Go back")).toHaveLength(1));
      expect(screen.getByText("Patient record")).toBeTruthy();
      for (const tab of ["Home", "Schedule", "Inbox", "Patients", "Profile"]) {
        expect(screen.queryByLabelText(tab)).toBeNull();
      }
      tree.unmount();
    }
  });
});

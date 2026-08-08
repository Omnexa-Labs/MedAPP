// The lab results screen — the first consumer of a client that had none.
//
// Weight sits on the three places the contract makes it easy to lie:
//
//   * A FAILED LIST must not render the empty state. Same rule as the
//     medications list, for the same reason.
//   * A FAILED SEARCH is a search failure, not a lab outage and not an empty
//     record. Search is backed by Qdrant and can be down while the list works.
//   * `resulted_at` may be NULL, and it is not the upload time. A missing
//     result date is rendered as missing rather than substituted.

import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { renderWithSafeArea } from "@/test/safe-area";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({}),
}));
jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));

const mockList = jest.fn();
const mockSearch = jest.fn();
jest.mock("../api", () => ({
  labApi: {
    listMyResults: (...a: unknown[]) => mockList(...a),
    searchMyResults: (...a: unknown[]) => mockSearch(...a),
  },
}));

import { ApiError } from "@/types/api";
import { LabResultsScreen } from "../LabResultsScreen";

function render(): ReturnType<typeof renderWithSafeArea> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui: ReactElement = (
    <QueryClientProvider client={qc}>
      <LabResultsScreen />
    </QueryClientProvider>
  );
  return renderWithSafeArea(ui);
}

const result = (over: Record<string, unknown> = {}) => ({
  id: "r-1",
  patientId: "p-1",
  labOrderId: null,
  uploadedByUserId: "u-1",
  source: "patient_upload",
  title: "Full blood count",
  status: "final",
  summary: "All indices within the reporting laboratory's range.",
  fileName: null,
  mimeType: null,
  externalUrl: null,
  resultedAtIso: "2026-07-30T09:00:00Z",
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue([]);
  mockSearch.mockResolvedValue([]);
});

describe("LabResultsScreen", () => {
  it("renders results from /v1/me/lab/results", async () => {
    mockList.mockResolvedValue([result()]);
    render();
    await waitFor(() => expect(screen.getByText("Full blood count")).toBeTruthy());
    expect(screen.getByText(/Resulted 30 July 2026 · final/)).toBeTruthy();
  }, 20000);

  it("a failed list renders an error, never 'no lab results yet'", async () => {
    mockList.mockRejectedValue(new ApiError("boom", 500));
    render();
    await waitFor(() => expect(screen.getByTestId("lab-results-error")).toBeTruthy());
    expect(screen.getByText(/This does not mean you have none/)).toBeTruthy();
    expect(screen.queryByTestId("lab-results-empty")).toBeNull();
    expect(screen.queryByText("No lab results yet")).toBeNull();
  });

  it("an answered empty list renders the empty state", async () => {
    render();
    await waitFor(() => expect(screen.getByTestId("lab-results-empty")).toBeTruthy());
    expect(screen.getByText("No lab results yet")).toBeTruthy();
  });

  it("a failed SEARCH keeps the list and says search failed", async () => {
    // Qdrant is a dependency the list route does not have. A search outage must
    // not read as "you have no results".
    mockList.mockResolvedValue([result()]);
    mockSearch.mockRejectedValue(new ApiError("qdrant down", 503));
    render();
    await waitFor(() => expect(screen.getByText("Full blood count")).toBeTruthy());

    fireEvent.changeText(screen.getByLabelText("Search your lab results"), "blood");
    await waitFor(() => expect(screen.getByTestId("lab-search-error")).toBeTruthy());

    expect(screen.getByText(/Search is unavailable right now/)).toBeTruthy();
    // The list is still there.
    expect(screen.getByText("Full blood count")).toBeTruthy();
    expect(screen.queryByTestId("lab-results-error")).toBeNull();
    expect(screen.queryByTestId("lab-results-empty")).toBeNull();
  });

  it("searches server-side rather than filtering in memory", async () => {
    mockList.mockResolvedValue([result()]);
    mockSearch.mockResolvedValue([result({ id: "r-2", title: "Lipid panel" })]);
    render();
    await waitFor(() => expect(screen.getByText("Full blood count")).toBeTruthy());

    fireEvent.changeText(screen.getByLabelText("Search your lab results"), "lipid");
    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith("lipid"));
    await waitFor(() => expect(screen.getByText("Lipid panel")).toBeTruthy());
  });

  it("renders a missing result date as missing, not as the upload time", async () => {
    mockList.mockResolvedValue([result({ resultedAtIso: null })]);
    render();
    await waitFor(() => expect(screen.getByText(/no result date recorded/)).toBeTruthy());
    expect(screen.queryByText(/Resulted /)).toBeNull();
  });

  it("names a report on file but offers nothing to open, because nothing can be", async () => {
    // File content is never returned by the service and there is no download
    // endpoint. A "View report" button would fail every time it was pressed.
    mockList.mockResolvedValue([result({ fileName: "fbc-2026-07-30.pdf" })]);
    render();
    await waitFor(() => expect(screen.getByText(/fbc-2026-07-30.pdf/)).toBeTruthy());
    expect(screen.queryByLabelText(/View report|Open report|Download/i)).toBeNull();
  });

  it("says a result has no summary rather than leaving a blank", async () => {
    mockList.mockResolvedValue([result({ summary: null })]);
    render();
    await waitFor(() =>
      expect(screen.getByText("No summary was provided with this result.")).toBeTruthy(),
    );
  });

  it("orders by the LAB's timestamp, with undated results last", async () => {
    mockList.mockResolvedValue([
      result({ id: "old", title: "Older panel", resultedAtIso: "2026-06-01T09:00:00Z" }),
      result({ id: "undated", title: "Undated panel", resultedAtIso: null }),
      result({ id: "new", title: "Newer panel", resultedAtIso: "2026-07-30T09:00:00Z" }),
    ]);
    render();
    await waitFor(() => expect(screen.getByText("Newer panel")).toBeTruthy());

    const titles = screen
      .getAllByText(/panel$/i)
      .map((node) => node.props.children as string);
    expect(titles).toEqual(["Newer panel", "Older panel", "Undated panel"]);
  });
});

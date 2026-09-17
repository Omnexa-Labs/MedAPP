import {
  patient,
  other,
  owner,
  params,
  course,
  page,
  empty,
  queryClient,
  tree,
} from "../testing/fixtures";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { client } from "@/lib/api/client";
import { ApiError } from "@/types/api";
import { saveTextDocument } from "@/lib/documents";
import { ActiveMedicationsScreen } from "../ActiveMedicationsScreen";
import { medicationApi } from "../medication-api";
let qc: ReturnType<typeof queryClient>;
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(client.get).mockReset().mockResolvedValue(page);
  owner(patient);
  params({});
  qc = queryClient();
});
afterEach(() => qc.clear());

it("loads saved medication courses and reopens with the same record", async () => {
  const view = render(tree(qc, <ActiveMedicationsScreen />));
  expect(await screen.findByText("Saved medicine")).toBeTruthy();
  expect(screen.queryByText("Sample")).toBeNull();
  view.unmount();
  qc.clear();
  render(tree(qc, <ActiveMedicationsScreen />));
  expect(await screen.findByText("Saved medicine")).toBeTruthy();
  expect(client.get).toHaveBeenCalledWith(
    "/v1/patients/" + patient + "/medications?status=all&limit=25&offset=0",
    expect.objectContaining({ signal: expect.anything() }),
  );
});
it("keeps a failed query distinct from an empty record and retries", async () => {
  jest
    .mocked(client.get)
    .mockRejectedValueOnce(new ApiError("Offline", 0))
    .mockResolvedValue(empty);
  render(tree(qc, <ActiveMedicationsScreen />));
  await screen.findByText("Could not load medications");
  expect(screen.queryByText("No medication courses in this view.")).toBeNull();
  fireEvent.press(screen.getByText("Try again"));
  await screen.findByText("No medication courses in this view.");
});
it("cancels requests and hides late data after an account switch", async () => {
  let resolve!: (value: unknown) => void;
  jest.mocked(client.get).mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const view = render(tree(qc, <ActiveMedicationsScreen />));
  await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));
  const options = jest.mocked(client.get).mock.calls[0][1]!;
  owner(other);
  jest.mocked(client.get).mockResolvedValue(empty);
  view.rerender(tree(qc, <ActiveMedicationsScreen />));
  await screen.findByText("No medication courses in this view.");
  expect(options.signal?.aborted).toBe(true);
  await act(async () => resolve(page));
  expect(screen.queryByText("Saved medicine")).toBeNull();
});
it("filters status and preserves paging from the server", async () => {
  jest.mocked(client.get).mockResolvedValue({ ...page, next_offset: 25 });
  render(tree(qc, <ActiveMedicationsScreen />));
  fireEvent.press(await screen.findByText("Next page"));
  await waitFor(() =>
    expect(client.get).toHaveBeenLastCalledWith(
      expect.stringContaining("offset=25"),
      expect.anything(),
    ),
  );
  jest.mocked(client.get).mockResolvedValue(empty);
  fireEvent.press(screen.getByText("Paused"));
  await screen.findByText("No medication courses in this view.");
  expect(client.get).toHaveBeenLastCalledWith(
    expect.stringContaining("status=paused&limit=25&offset=0"),
    expect.anything(),
  );
});
it("refreshes the record before exporting and labels the selected page", async () => {
  render(tree(qc, <ActiveMedicationsScreen />));
  await screen.findByText("Saved medicine");
  jest.mocked(client.get).mockResolvedValue({ ...page, items: [{ ...course, status: "stopped" }] });
  fireEvent.press(screen.getByText("Save this page (.txt)"));
  await screen.findByText("Copy saved");
  expect(saveTextDocument).toHaveBeenCalledWith(
    expect.objectContaining({ body: expect.stringContaining("Tracking: Stopped") }),
  );
  expect(saveTextDocument).toHaveBeenCalledWith(
    expect.objectContaining({ body: expect.stringContaining("page 1") }),
  );
});
it("rejects medication pages for another account", async () => {
  jest
    .mocked(client.get)
    .mockResolvedValue({ ...page, items: [{ ...course, patient_user_id: other }] });
  await expect(medicationApi.list(patient, "all", 0, {})).rejects.toThrow("owner");
});

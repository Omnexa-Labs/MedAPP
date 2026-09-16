// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HospitalProfileScreen } from "../src/components/hospital-profile/hospital-profile-screen";
import {
  HospitalProfile,
  hospitalProfileRepository as repository,
} from "../src/lib/repositories/hospital-profile.repository";
import { useAuthStore } from "../src/lib/stores/auth.store";
import { hospitals, user } from "./session-fixture";
vi.mock(
  "../src/lib/repositories/hospital-profile.repository",
  async (original) => ({
    ...(await original<object>()),
    hospitalProfileRepository: {
      get: vi.fn(),
      save: vi.fn(),
      publish: vi.fn(),
      withdraw: vi.fn(),
      history: vi.fn(),
    },
  }),
);
const scope = "p".repeat(32);
const initial: HospitalProfile = {
  hospital_id: hospitals[0].hospital_id,
  version: 1,
  is_listed: false,
  has_unpublished_changes: false,
  last_published_at: null,
  published: null,
  accreditation: "JCI",
  accreditation_status: "approved",
  publication_issues: [],
  draft: {
    name: "Accra Hospital",
    description: "General care",
    specialty: null,
    insurance_accepted: ["NHIS"],
    address_line1: "1 Hospital Road",
    city: "Accra",
    country: "GH",
    contact_phone: "+233200000000",
    contact_email: null,
    website_url: null,
    latitude: null,
    longitude: null,
  },
};
let clients: QueryClient[] = [];
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  return {
    ...render(
      <QueryClientProvider client={client}>
        <HospitalProfileScreen />
      </QueryClientProvider>,
    ),
    client,
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  useAuthStore.setState({
    scope,
    identity: { user, scope, workspace: hospitals[0], workspaces: hospitals },
    user: {
      id: user.id,
      email: user.email,
      fullName: "Ada Owner",
      role: "user",
      hospitalId: hospitals[0].hospital_id,
      hospitalName: hospitals[0].hospital_name,
      hmsRole: "hospital_admin",
    },
  });
  vi.mocked(repository.get).mockResolvedValue(structuredClone(initial));
  vi.mocked(repository.history).mockResolvedValue({
    items: [],
    has_more: false,
  });
});
afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients = [];
});
const input = () => screen.getByLabelText("Hospital name (required)");
const click = (label: string) =>
  fireEvent.click(screen.getByRole("button", { name: label }));

it("saves only changed fields, previews the saved draft and requires explicit publication", async () => {
  const saved = {
    ...initial,
    version: 2,
    has_unpublished_changes: true,
    draft: { ...initial.draft, name: "Accra Care" },
  };
  vi.mocked(repository.save).mockResolvedValue(saved);
  vi.mocked(repository.publish).mockResolvedValue({
    ...saved,
    version: 3,
    is_listed: true,
    has_unpublished_changes: false,
    published: saved.draft,
  });
  mount();
  await screen.findByText("Edit draft");
  fireEvent.change(input(), { target: { value: "Accra Care" } });
  expect(
    screen.getByRole("button", { name: "Review and publish" }),
  ).toBeDisabled();
  expect(
    within(
      screen.getByRole("region", { name: "Saved draft preview" }),
    ).getByText("Accra Hospital"),
  ).toBeInTheDocument();
  click("Save draft");
  await screen.findByText(/Draft saved\. Publish/);
  expect(repository.save).toHaveBeenCalledWith(
    1,
    { name: "Accra Care" },
    expect.any(AbortSignal),
  );
  expect(repository.publish).not.toHaveBeenCalled();
  click("Review and publish");
  expect(repository.publish).not.toHaveBeenCalled();
  click("Confirm publication");
  await screen.findByText(
    "Hospital profile published to the patient directory.",
  );
  expect(repository.publish).toHaveBeenCalledWith(2, expect.any(AbortSignal));
  expect(
    within(
      screen.getByRole("region", { name: "Current public details" }),
    ).getByText("Accra Care"),
  ).toBeInTheDocument();
}, 15000);

it("keeps the current public details unchanged after a new draft is saved", async () => {
  vi.mocked(repository.get).mockResolvedValue({
    ...initial,
    is_listed: true,
    published: initial.draft,
  });
  vi.mocked(repository.save).mockResolvedValue({
    ...initial,
    version: 2,
    is_listed: true,
    published: initial.draft,
    has_unpublished_changes: true,
    draft: { ...initial.draft, description: "Expanded services" },
  });
  mount();
  await screen.findByText("Edit draft");
  fireEvent.change(screen.getByLabelText("About the hospital"), {
    target: { value: "Expanded services" },
  });
  click("Save draft");
  await screen.findByText(/Draft saved\. Publish/);
  expect(
    within(
      screen.getByRole("region", { name: "Current public details" }),
    ).getByText("General care"),
  ).toBeInTheDocument();
  expect(
    within(
      screen.getByRole("region", { name: "Saved draft preview" }),
    ).getByText("Expanded services"),
  ).toBeInTheDocument();
  expect(repository.publish).not.toHaveBeenCalled();
});

it("retains inputs after a stale save and requires confirmed reload before another write", async () => {
  vi.mocked(repository.save).mockRejectedValue({
    response: {
      status: 409,
      data: { detail: "Another administrator changed this profile." },
    },
  });
  mount();
  await screen.findByText("Edit draft");
  fireEvent.change(input(), { target: { value: "Local unsaved edit" } });
  click("Save draft");
  await screen.findByText("Another administrator changed this profile.");
  expect(input()).toHaveValue("Local unsaved edit");
  expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
  vi.mocked(repository.get).mockResolvedValue({
    ...initial,
    version: 4,
    draft: { ...initial.draft, name: "Latest saved name" },
  });
  click("Reload saved profile");
  expect(repository.get).toHaveBeenCalledTimes(1);
  click("Keep editing");
  expect(input()).toHaveValue("Local unsaved edit");
  click("Reload saved profile");
  click("Discard and reload");
  await screen.findByText("Latest saved profile loaded.");
  expect(input()).toHaveValue("Latest saved name");
  expect(repository.save).toHaveBeenCalledTimes(1);
}, 15000);

it("shows validation errors without clearing edits or automatically replaying a save", async () => {
  vi.mocked(repository.save).mockRejectedValue({
    response: {
      status: 422,
      data: {
        detail: [
          {
            loc: ["body", "changes", "contact_email"],
            msg: "Enter a valid contact email address.",
          },
        ],
      },
    },
  });
  mount();
  await screen.findByText("Edit draft");
  fireEvent.change(input(), { target: { value: "Changed" } });
  click("Save draft");
  await screen.findByText("Enter a valid contact email address.");
  expect(input()).toHaveValue("Changed");
  expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
  expect(repository.save).toHaveBeenCalledTimes(1);
});

it("requires reload after an uncertain publication response and does not replay the request", async () => {
  vi.mocked(repository.publish).mockRejectedValue({
    response: { status: 503 },
  });
  mount();
  await screen.findByText("Edit draft");
  click("Review and publish");
  click("Confirm publication");
  await screen.findByText(
    /Reload the saved profile before making another change/,
  );
  expect(repository.publish).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole("button", { name: "Review and publish" }),
  ).toBeDisabled();
});

it("withdraws only after confirmation and keeps unsaved local edits", async () => {
  vi.mocked(repository.get).mockResolvedValue({
    ...initial,
    is_listed: true,
    published: initial.draft,
  });
  vi.mocked(repository.withdraw).mockResolvedValue({ ...initial, version: 2 });
  mount();
  await screen.findByText("Edit draft");
  fireEvent.change(input(), { target: { value: "Keep this edit" } });
  click("Withdraw listing");
  expect(repository.withdraw).not.toHaveBeenCalled();
  click("Confirm withdrawal");
  await screen.findByText(
    "Hospital listing withdrawn from the patient directory.",
  );
  expect(repository.withdraw).toHaveBeenCalledWith(1, expect.any(AbortSignal));
  expect(input()).toHaveValue("Keep this edit");
  expect(
    screen.queryByRole("region", { name: "Current public details" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
});

it("blocks publication of incomplete saved details and supports a failed-load retry", async () => {
  vi.mocked(repository.get)
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({
      ...initial,
      publication_issues: [
        { field: "city", message: "City is required before publication." },
      ],
    });
  mount();
  await screen.findByRole("button", { name: "Retry profile" });
  click("Retry profile");
  await screen.findByText("City is required before publication.");
  expect(
    screen.getByRole("button", { name: "Review and publish" }),
  ).toBeDisabled();
  expect(repository.publish).not.toHaveBeenCalled();
});

it("does not load hospital details for another staff role", () => {
  useAuthStore.setState({
    user: { ...useAuthStore.getState().user!, hmsRole: "doctor" },
  });
  mount();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Only a hospital administrator",
  );
  expect(repository.get).not.toHaveBeenCalled();
});

it("cancels an in-flight save and discards its result after the hospital scope changes", async () => {
  let finish!: (value: HospitalProfile) => void;
  vi.mocked(repository.save).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { client } = mount();
  await screen.findByText("Edit draft");
  fireEvent.change(input(), { target: { value: "Old hospital edit" } });
  click("Save draft");
  await waitFor(() => expect(repository.save).toHaveBeenCalledTimes(1));
  const signal = vi.mocked(repository.save).mock.calls[0][2]!;
  const next = {
    ...initial,
    hospital_id: hospitals[1].hospital_id,
    draft: { ...initial.draft, name: "Other hospital" },
  };
  vi.mocked(repository.get).mockResolvedValue(next);
  act(() => useAuthStore.setState({ scope: "q".repeat(32) }));
  await screen.findByDisplayValue("Other hospital");
  expect(signal.aborted).toBe(true);
  await act(async () =>
    finish({
      ...initial,
      version: 2,
      draft: { ...initial.draft, name: "Old hospital edit" },
    }),
  );
  expect(input()).toHaveValue("Other hospital");
  expect(
    client.getQueryData<HospitalProfile>(["hospital-profile", scope])?.version,
  ).toBe(1);
});

it("paginates publication history and shows recorded before/after changes", async () => {
  vi.mocked(repository.history)
    .mockResolvedValueOnce({
      items: [
        {
          id: "event-1",
          actor_id: user.id,
          action: "profile.published",
          version: 2,
          created_at: "2026-09-15T10:00:00Z",
          changed_fields: ["name"],
          before: { name: "Old name" },
          after: { name: "New name" },
        },
      ],
      has_more: true,
    })
    .mockResolvedValue({ items: [], has_more: false });
  mount();
  await screen.findByText("Profile published");
  expect(screen.getByText("Old name → New name")).toBeInTheDocument();
  click("Next changes");
  await screen.findByText("No profile changes recorded yet.");
  expect(repository.history).toHaveBeenLastCalledWith(
    20,
    expect.any(AbortSignal),
  );
});

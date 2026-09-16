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
import { PharmacyProfileScreen } from "../src/components/pharmacy-profile/pharmacy-profile-screen";
import {
  PharmacyProfile,
  pharmacyProfileRepository as repository,
} from "../src/lib/repositories/pharmacy-profile.repository";
import { useAuthStore } from "../src/lib/stores/auth.store";
import { identity, user } from "./session-fixture";
const pharmacys = [
  { pharmacy_id: identity.pharmacy.id! },
  { pharmacy_id: "99999999-9999-4999-8999-999999999999" },
];
vi.mock(
  "../src/lib/repositories/pharmacy-profile.repository",
  async (original) => ({
    ...(await original<object>()),
    pharmacyProfileRepository: {
      get: vi.fn(),
      save: vi.fn(),
      publish: vi.fn(),
      withdraw: vi.fn(),
      history: vi.fn(),
      uploadPhoto: vi.fn(),
      photo: vi.fn(),
    },
  }),
);
const scope = "p".repeat(32);
const initial: PharmacyProfile = {
  pharmacy_id: pharmacys[0].pharmacy_id,
  version: 1,
  is_listed: false,
  has_unpublished_changes: false,
  last_published_at: null,
  published: null,
  license_number: "PCG-2026-01",
  license_categories: ["Retail"],
  publication_issues: [],
  draft: {
    name: "Accra Pharmacy",
    description: "General care",
    services_offered: [],
    operating_hours: { monday: "08:00-18:00" },
    photo_url: null,
    head_pharmacist_name: null,
    head_pharmacist_bio: null,
    insurance_accepted: ["NHIS"],
    address_line1: "1 Pharmacy Road",
    city: "Accra",
    country: "GH",
    phone: "+233200000000",
    email: null,
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
        <PharmacyProfileScreen />
      </QueryClientProvider>,
    ),
    client,
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:photo-preview"),
      revokeObjectURL: vi.fn(),
    }),
  );
  useAuthStore.setState({
    scope,
    identity: { ...identity, scope },
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: "pharmacy_admin",
    },
  });
  vi.mocked(repository.get).mockResolvedValue(structuredClone(initial));
  vi.mocked(repository.history).mockResolvedValue({
    items: [],
    has_more: false,
  });
  vi.mocked(repository.photo).mockResolvedValue(
    new Blob(["photo"], { type: "image/jpeg" }),
  );
});
afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients = [];
});
const input = () => screen.getByLabelText("Pharmacy name (required)");
const click = (label: string) =>
  fireEvent.click(screen.getByRole("button", { name: label }));
const chosenPhoto = () =>
  new File(["photo"], "storefront.png", { type: "image/png" });
const choosePhoto = (file = chosenPhoto()) => {
  fireEvent.change(screen.getByLabelText("Choose pharmacy photo"), {
    target: { files: [file] },
  });
  return file;
};
const managedUrl = `/v1/pharmacies/${initial.pharmacy_id}/photos/11111111-1111-4111-8111-111111111111`;
it("uploads the chosen photo to a private saved draft and requires separate publication", async () => {
  vi.mocked(repository.uploadPhoto).mockResolvedValue({
    ...initial,
    version: 2,
    has_unpublished_changes: true,
    draft: { ...initial.draft, photo_url: managedUrl },
  });
  mount();
  await screen.findByText("Edit draft");
  const file = choosePhoto();
  expect(
    screen.getByRole("button", { name: "Review and publish" }),
  ).toBeDisabled();
  click("Upload to draft");
  await screen.findByText(/Photo saved to your draft/);
  expect(repository.uploadPhoto).toHaveBeenCalledWith(
    1,
    file,
    expect.any(AbortSignal),
  );
  expect(repository.photo).toHaveBeenCalledWith(
    managedUrl.split("/").at(-1),
    expect.any(AbortSignal),
  );
  expect(repository.publish).not.toHaveBeenCalled();
  expect(screen.queryByText("Current public details")).not.toBeInTheDocument();
  expect(screen.queryByText(/Selected: storefront/)).not.toBeInTheDocument();
});
it("keeps other edits and selection until the details are saved before upload", async () => {
  vi.mocked(repository.save).mockResolvedValue({
    ...initial,
    version: 2,
    draft: { ...initial.draft, name: "Edited pharmacy" },
  });
  mount();
  await screen.findByText("Edit draft");
  fireEvent.change(input(), { target: { value: "Edited pharmacy" } });
  choosePhoto();
  expect(
    screen.getByRole("button", { name: "Upload to draft" }),
  ).toBeDisabled();
  click("Save draft");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Upload to draft" }),
    ).toBeEnabled(),
  );
  expect(input()).toHaveValue("Edited pharmacy");
  expect(repository.save).toHaveBeenCalledWith(
    1,
    { name: "Edited pharmacy" },
    expect.any(AbortSignal),
  );
  expect(screen.getByText(/Selected: storefront/)).toBeVisible();
});
it("removes a draft photo through saved changes without removing the published photo", async () => {
  const details = {
    ...initial.draft,
    photo_url: "https://photos.example/live.jpg",
  };
  vi.mocked(repository.get).mockResolvedValue({
    ...initial,
    is_listed: true,
    draft: details,
    published: details,
  });
  vi.mocked(repository.save).mockResolvedValue({
    ...initial,
    version: 2,
    is_listed: true,
    published: details,
    has_unpublished_changes: true,
  });
  mount();
  await screen.findByText("Edit draft");
  click("Remove draft photo");
  expect(repository.save).not.toHaveBeenCalled();
  click("Save draft");
  await waitFor(() =>
    expect(repository.save).toHaveBeenCalledWith(
      1,
      { photo_url: null },
      expect.any(AbortSignal),
    ),
  );
  expect(
    within(
      screen.getByRole("region", { name: "Current public details" }),
    ).getByAltText("Accra Pharmacy storefront"),
  ).toHaveAttribute("src", details.photo_url);
});
it.each(["image/svg+xml", "application/pdf"])(
  "rejects unsupported %s before uploading",
  async (type) => {
    mount();
    await screen.findByText("Edit draft");
    choosePhoto(new File(["invalid"], "image", { type }));
    expect(screen.getByRole("alert")).toHaveTextContent("JPEG, PNG or WebP");
    expect(repository.uploadPhoto).not.toHaveBeenCalled();
  },
);
it("preserves selection after an uncertain upload and requires reload", async () => {
  vi.mocked(repository.uploadPhoto).mockRejectedValue(
    new Error("Lost response"),
  );
  mount();
  await screen.findByText("Edit draft");
  choosePhoto();
  click("Upload to draft");
  await screen.findByRole("alert");
  expect(screen.getByText(/Selected: storefront/)).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Upload to draft" }),
  ).toBeDisabled();
  click("Reload saved profile");
  expect(screen.getByText("Discard unsaved changes and reload?")).toBeVisible();
  click("Discard and reload");
  await screen.findByText("Latest saved profile loaded.");
  expect(screen.queryByText(/Selected: storefront/)).not.toBeInTheDocument();
});
it("aborts a photo upload when the pharmacy session changes", async () => {
  const pending = Promise.withResolvers<PharmacyProfile>();
  vi.mocked(repository.uploadPhoto).mockReturnValue(pending.promise);
  mount();
  await screen.findByText("Edit draft");
  choosePhoto();
  click("Upload to draft");
  await waitFor(() => expect(repository.uploadPhoto).toHaveBeenCalled());
  const signal = vi.mocked(repository.uploadPhoto).mock.calls[0][2]!;
  act(() => useAuthStore.setState({ scope: null, identity: null, user: null }));
  expect(signal.aborted).toBe(true);
  await act(async () => pending.resolve({ ...initial, version: 2 }));
  expect(
    screen.queryByText(/Photo saved to your draft/),
  ).not.toBeInTheDocument();
});
it("retries private photo preview and releases object URLs on unmount", async () => {
  vi.mocked(repository.get).mockResolvedValue({
    ...initial,
    draft: { ...initial.draft, photo_url: managedUrl },
  });
  vi.mocked(repository.photo).mockRejectedValueOnce(new Error("Network"));
  const mounted = mount();
  await screen.findByText(/The pharmacy photo could not be loaded/);
  click("Retry photo");
  await screen.findByAltText("Accra Pharmacy storefront");
  mounted.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:photo-preview");
});
it("shows a photo failure and tries a replacement photo after the saved profile reloads", async () => {
  vi.mocked(repository.get).mockResolvedValueOnce({
    ...initial,
    draft: { ...initial.draft, photo_url: "https://photos.example/old.jpg" },
  });
  mount();
  const photo = await screen.findByAltText("Accra Pharmacy storefront");
  fireEvent.error(photo);
  expect(
    screen.getByText(/The pharmacy photo could not be loaded/),
  ).toBeVisible();
  vi.mocked(repository.get).mockResolvedValue({
    ...initial,
    version: 2,
    draft: { ...initial.draft, photo_url: "https://photos.example/new.jpg" },
  });
  click("Reload saved profile");
  await waitFor(() =>
    expect(screen.getByAltText("Accra Pharmacy storefront")).toHaveAttribute(
      "src",
      "https://photos.example/new.jpg",
    ),
  );
});
it("saves services and a complete day schedule through normal form controls", async () => {
  vi.mocked(repository.save).mockResolvedValue({ ...initial, version: 2 });
  mount();
  await screen.findByText("Edit draft");
  fireEvent.change(screen.getByLabelText("Services offered"), {
    target: { value: "Prescription refills\nVaccinations" },
  });
  fireEvent.change(screen.getByLabelText("tuesday opening"), {
    target: { value: "24 hours" },
  });
  click("Save draft");
  await waitFor(() => expect(repository.save).toHaveBeenCalled());
  expect(vi.mocked(repository.save).mock.calls[0][1]).toEqual({
    services_offered: ["Prescription refills", "Vaccinations"],
    operating_hours: { monday: "08:00-18:00", tuesday: "24 hours" },
  });
});

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
    ).getByText("Accra Pharmacy"),
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
    "Pharmacy profile published to the patient directory.",
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
  fireEvent.change(screen.getByLabelText("About the pharmacy"), {
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
            loc: ["body", "changes", "email"],
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
    "Pharmacy listing withdrawn from the patient directory.",
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

it("does not load pharmacy details for another staff role", () => {
  useAuthStore.setState({
    user: { ...useAuthStore.getState().user!, role: "cashier" },
  });
  mount();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Sign in with the approved MedApp pharmacy owner account",
  );
  expect(repository.get).not.toHaveBeenCalled();
});

it("cancels an in-flight save and discards its result after the pharmacy scope changes", async () => {
  let finish!: (value: PharmacyProfile) => void;
  vi.mocked(repository.save).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { client } = mount();
  await screen.findByText("Edit draft");
  fireEvent.change(input(), { target: { value: "Old pharmacy edit" } });
  click("Save draft");
  await waitFor(() => expect(repository.save).toHaveBeenCalledTimes(1));
  const signal = vi.mocked(repository.save).mock.calls[0][2]!;
  const next = {
    ...initial,
    pharmacy_id: pharmacys[1].pharmacy_id,
    draft: { ...initial.draft, name: "Other pharmacy" },
  };
  vi.mocked(repository.get).mockResolvedValue(next);
  act(() => useAuthStore.setState({ scope: "q".repeat(32) }));
  await screen.findByDisplayValue("Other pharmacy");
  expect(signal.aborted).toBe(true);
  await act(async () =>
    finish({
      ...initial,
      version: 2,
      draft: { ...initial.draft, name: "Old pharmacy edit" },
    }),
  );
  expect(input()).toHaveValue("Other pharmacy");
  expect(
    client.getQueryData<PharmacyProfile>(["pharmacy-profile", scope])?.version,
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

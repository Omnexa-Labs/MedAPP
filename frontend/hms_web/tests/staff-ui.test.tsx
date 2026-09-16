// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  JoinInvitation,
  invitationRequest,
} from "../src/components/staff/join-invitation";
import { InviteStaffForm } from "../src/components/staff/invite-staff-form";
import { TeamAccess } from "../src/components/staff/team-access";
import StaffPage from "../src/app/(dashboard)/staff/page";
import StaffDetails from "../src/app/(dashboard)/staff/[id]/page";
import { teamRepository } from "../src/lib/repositories/team.repository";
import { staffRepository } from "../src/lib/repositories/staff.repository";
import { useAuthStore } from "../src/lib/stores/auth.store";
import { user, hospitals } from "./session-fixture";
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "staff-1" }) }));
vi.mock("../src/lib/repositories/team.repository", async (original) => ({
  ...(await original<object>()),
  teamRepository: {
    invite: vi.fn(),
    invitations: vi.fn(),
    memberships: vi.fn(),
    cancel: vi.fn(),
    change: vi.fn(),
    history: vi.fn(),
  },
}));
vi.mock("../src/lib/repositories/staff.repository", () => ({
  staffRepository: {
    listDepartments: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
  },
}));
const scope = "a".repeat(32),
  code = "c".repeat(43);
const invitation = {
  id: "invite-1",
  email: user.email,
  hms_role: "nurse",
  status: "pending" as const,
  created_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 86400000).toISOString(),
};
const member = {
  id: "member-1",
  user_id: user.id,
  hms_role: "nurse",
  is_active: true,
  version: 3,
  staff_id: "staff-1",
  name: "Ada Owner",
  email: user.email,
};
const identity = {
  user,
  scope,
  workspace: hospitals[0],
  workspaces: hospitals,
};
function mount(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
  return { ...view, client };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(teamRepository.history).mockResolvedValue({
    items: [],
    has_more: false,
  });
  useAuthStore.setState({
    identity,
    scope,
    user: {
      id: user.id,
      email: user.email,
      fullName: "Ada Owner",
      role: "user",
      hospitalId: hospitals[0].hospital_id,
      hospitalName: hospitals[0].hospital_name,
      hmsRole: "hospital_admin",
    },
    isAuthenticated: true,
    isHydrating: false,
    error: null,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(identity)),
  );
  vi.mocked(staffRepository.listDepartments).mockResolvedValue({
    data: { items: [] },
  } as never);
  vi.mocked(teamRepository.invite).mockResolvedValue({ ...invitation, code });
  vi.mocked(teamRepository.memberships).mockResolvedValue({
    items: [member],
    has_more: false,
  });
  vi.mocked(teamRepository.invitations).mockResolvedValue({
    items: [invitation],
    has_more: false,
  });
  vi.mocked(teamRepository.change).mockResolvedValue({} as never);
  vi.mocked(teamRepository.cancel).mockResolvedValue({} as never);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("requires preview and acceptance before refreshing workspace access", async () => {
  const fetcher = vi.fn(async (path: string) =>
    Response.json(
      path.endsWith("/inspect")
        ? {
            ...invitation,
            hospital_name: "New Hospital",
            hospital_id: hospitals[1].hospital_id,
          }
        : path.endsWith("/accept")
          ? { hospital_id: hospitals[1].hospital_id }
          : identity,
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  mount(<JoinInvitation />);
  fireEvent.change(screen.getByLabelText("Invitation code"), {
    target: { value: code },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review invitation" }));
  expect(await screen.findByText("New Hospital")).toBeVisible();
  expect(fetcher.mock.calls.some(([path]) => path.endsWith("/accept"))).toBe(
    false,
  );
  fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "You joined New Hospital",
  );
  expect(screen.getByLabelText("Invitation code")).toHaveValue("");
  expect(fetcher.mock.calls.some(([path]) => path === "/api/session")).toBe(
    true,
  );
}, 15000);
it("shows rejected invitations and preserves the code for correction", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        { detail: "Use the invited verified email." },
        { status: 403 },
      ),
    ),
  );
  mount(<JoinInvitation />);
  fireEvent.change(screen.getByLabelText("Invitation code"), {
    target: { value: code },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review invitation" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("verified email");
  expect(screen.getByLabelText("Invitation code")).toHaveValue(code);
  expect(
    screen.queryByRole("button", { name: "Accept invitation" }),
  ).toBeNull();
});
it("discards a preview response after the account scope changes", async () => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    ),
  );
  const pending = invitationRequest("inspect", code);
  useAuthStore.setState({ scope: "b".repeat(32) });
  resolve(Response.json(invitation));
  await expect(pending).rejects.toThrow("account changed");
});
it("creates an invitation with email and role, then displays its one-time code", async () => {
  mount(<InviteStaffForm />);
  fireEvent.change(screen.getByLabelText("MedApp email address"), {
    target: { value: user.email },
  });
  fireEvent.change(screen.getByLabelText("Hospital role"), {
    target: { value: "nurse" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create invitation" }));
  expect(await screen.findByLabelText("Invitation code")).toHaveValue(code);
  expect(teamRepository.invite).toHaveBeenCalledWith(
    { email: user.email, hms_role: "nurse" },
    expect.any(AbortSignal),
  );
  expect(
    screen.getByText(/Access begins after the recipient accepts/),
  ).toBeVisible();
});
it("denies invitation creation to department heads without requesting department data", () => {
  useAuthStore.setState({
    user: { ...useAuthStore.getState().user!, hmsRole: "department_head" },
  });
  mount(<InviteStaffForm />);
  expect(
    screen.getByRole("heading", {
      name: "Hospital administrator access required",
    }),
  ).toBeVisible();
  expect(staffRepository.listDepartments).not.toHaveBeenCalled();
});
it("confirms revocation using the displayed membership version", async () => {
  mount(<TeamAccess />);
  fireEvent.click(await screen.findByRole("button", { name: "Change access" }));
  fireEvent.click(screen.getByLabelText("Revoke hospital access"));
  expect(teamRepository.change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm revocation" }));
  await waitFor(() =>
    expect(teamRepository.change).toHaveBeenCalledWith(member, "nurse", false),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("form", { name: "Change staff access" }),
    ).toBeNull(),
  );
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  await waitFor(() => expect(useAuthStore.getState().isHydrating).toBe(false));
}, 15000);
it("keeps a stale access error visible and refresh lets the user reopen the latest record", async () => {
  vi.mocked(teamRepository.change).mockRejectedValue({
    response: {
      data: { detail: "This membership changed. Refresh the team." },
    },
  });
  mount(<TeamAccess />);
  fireEvent.click(await screen.findByRole("button", { name: "Change access" }));
  fireEvent.click(screen.getByRole("button", { name: "Save access change" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "membership changed",
  );
  fireEvent.click(screen.getByRole("button", { name: "Refresh team" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("form", { name: "Change staff access" }),
    ).toBeNull(),
  );
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  await waitFor(() => expect(useAuthStore.getState().isHydrating).toBe(false));
});
it("confirms pending invitation cancellation and reloads history", async () => {
  mount(<TeamAccess />);
  fireEvent.click(
    await screen.findByRole(
      "button",
      { name: "Cancel invitation" },
      { timeout: 5000 },
    ),
  );
  expect(teamRepository.cancel).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }));
  await waitFor(() =>
    expect(teamRepository.cancel).toHaveBeenCalledWith(invitation.id),
  );
  await waitFor(() => expect(teamRepository.history).toHaveBeenCalledTimes(2));
  expect(
    screen.queryByRole("button", { name: "Confirm cancellation" }),
  ).toBeNull();
}, 15000);
it("shows a failed staff list as an error with retry", async () => {
  vi.mocked(staffRepository.list).mockRejectedValue(new Error("offline"));
  mount(<StaffPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "could not be loaded",
  );
  expect(screen.queryByText("No staff members found")).toBeNull();
  vi.mocked(staffRepository.list).mockResolvedValue({
    data: { items: [], has_more: false },
  } as never);
  fireEvent.click(screen.getByRole("button", { name: "Retry staff records" }));
  expect(await screen.findByText("No staff members found")).toBeVisible();
});
it("saves only edited fields when another administrator updates the record", async () => {
  const record = {
    staff_id: "staff-1",
    user_id: user.id,
    first_name: "Ada",
    last_name: "Owner",
    employee_id: "EMP-1",
    title: "Nurse",
    specialty: null,
    qualification: null,
    email: user.email,
    phone: null,
    updated_at: new Date().toISOString(),
  };
  vi.mocked(staffRepository.get).mockResolvedValue({ data: record } as never);
  const latest = { ...record, specialty: "Cardiology", title: "Senior nurse" };
  vi.mocked(staffRepository.update).mockResolvedValue({
    data: latest,
  } as never);
  const { client } = mount(<StaffDetails />);
  expect(await screen.findByLabelText("First name")).toHaveValue("Ada");
  await act(async () => {
    client.setQueryData(["staff", "detail", "staff-1"], {
      ...record,
      specialty: "Cardiology",
    });
  });
  vi.mocked(staffRepository.get).mockResolvedValue({ data: latest } as never);
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "Senior nurse" },
  });
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Save staff details" })),
  );
  expect(staffRepository.update).toHaveBeenCalledWith("staff-1", {
    title: "Senior nurse",
  });
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Staff details saved",
  );
  expect(screen.getByLabelText("Specialty")).toHaveValue("Cardiology");
});

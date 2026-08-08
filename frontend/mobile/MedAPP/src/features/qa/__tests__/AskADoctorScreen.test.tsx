// Ask a doctor — the four list states, the anonymity guarantee, and the ask.
//
// The suite is written against the REAL client seam (`@/lib/api/client`), not a
// mocked `qaApi`, so the bare-array envelope and the mapper's refusal to carry a
// user id are exercised by every screen assertion rather than only by api.test.
// A screen test over a mocked module would have passed with the feed's
// `{ items }` shape, which is exactly the defect being guarded.
//
// What is pinned here:
//   - a BARE ARRAY renders rows;
//   - an anonymous question shows no id and no invented name;
//   - unanswered renders as a STATE, not a spinner;
//   - the ask mutation shows a VISIBLE error on failure and keeps the draft;
//   - empty and error are distinguishable from each other and from loading.
//
// SEAM: `@/lib/api/client`.

import { screen, fireEvent, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { renderWithSafeArea as renderRaw } from "@/test/safe-area";

const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock("@/lib/api/client", () => ({
  client: {
    get: (...a: unknown[]) => mockGet(...a),
    post: (...a: unknown[]) => mockPost(...a),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
  registerAuthTokenProvider: jest.fn(),
  registerDeviceIdProvider: jest.fn(),
}));

jest.mock("expo-router", () => ({
  router: {
    back: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    canGoBack: () => true,
  },
  useLocalSearchParams: () => ({}),
}));

jest.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => ({ id: "u-me", displayName: "Ama Mensah" }),
  useIsAuthenticated: () => true,
}));

import { AskADoctorScreen } from "../AskADoctorScreen";

const ANON_ID = "u-secret-42";

const qaWire = (over: Record<string, unknown> = {}) => ({
  question_id: "q-1",
  author_user_id: null,
  author_role: "patient",
  question: "Is it normal to feel dizzy when I stand up quickly?",
  is_anonymous: true,
  moderation_status: "approved",
  answer: null,
  answered_by_user_id: null,
  answered_at: null,
  created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  ...over,
});

function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const ui: ReactElement = (
    <QueryClientProvider client={client}>
      <AskADoctorScreen />
    </QueryClientProvider>
  );
  return renderRaw(ui);
}

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
});

describe("the list reads a bare array", () => {
  it("renders rows from an array body, not an `{ items }` envelope", async () => {
    mockGet.mockResolvedValue([
      qaWire(),
      qaWire({ question_id: "q-2", question: "How long after malaria should I retest?" }),
    ]);

    renderScreen();

    expect(await screen.findByTestId("qa-question-q-1")).toBeTruthy();
    expect(screen.getByTestId("qa-question-q-2")).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith("/v1/social/qa");
  });

  it("renders nothing from an `{ items }` body — the shapes are not interchangeable", async () => {
    // If this ever starts passing as a populated list, someone has taught the
    // client to accept both envelopes, and the contract has stopped being one.
    mockGet.mockResolvedValue({ items: [qaWire()], next_offset: null });

    renderScreen();

    expect(await screen.findByTestId("qa-error")).toBeTruthy();
    expect(screen.queryByTestId("qa-question-q-1")).toBeNull();
  });
});

describe("the anonymous asker", () => {
  it("renders no author id and no invented name", async () => {
    // The id is present on the wire, as an older deployment sent it. Nothing on
    // screen may reproduce it, and nothing may substitute a name for it.
    mockGet.mockResolvedValue([qaWire({ author_user_id: ANON_ID })]);

    renderScreen();
    await screen.findByTestId("qa-question-q-1");

    expect(screen.queryByText(new RegExp(ANON_ID))).toBeNull();
    expect(screen.getByText("Anonymous")).toBeTruthy();
    expect(screen.getByText("Asked anonymously")).toBeTruthy();
  });

  it("puts no initials on the avatar — there is no name to derive one from", async () => {
    mockGet.mockResolvedValue([qaWire({ author_user_id: ANON_ID })]);

    renderScreen();
    await screen.findByTestId("qa-question-q-1");

    // `AvatarWithFallback` walks photo -> initials -> silhouette, and it is
    // passed `initials={null}` so it lands on the silhouette. If someone
    // "helpfully" derives initials from the byline it renders "A" for
    // "Anonymous"; from the wire id it renders "U". Neither may exist.
    expect(screen.queryByText("A")).toBeNull();
    expect(screen.queryByText("U")).toBeNull();
    // The avatar is still announced, by the byline rather than by an identity.
    expect(screen.getAllByLabelText("Anonymous").length).toBeGreaterThan(0);
  });

  it("does not label an attributed question as anonymous", async () => {
    mockGet.mockResolvedValue([qaWire({ is_anonymous: false })]);

    renderScreen();
    await screen.findByTestId("qa-question-q-1");

    expect(screen.queryByText("Asked anonymously")).toBeNull();
    expect(screen.queryByText("Anonymous")).toBeNull();
    // No `author_name` on the wire, so the neutral label — never an id.
    expect(screen.getByText("MedApp member")).toBeTruthy();
  });
});

describe("unanswered is a state, not a loading state", () => {
  it("renders settled copy and no spinner", async () => {
    mockGet.mockResolvedValue([qaWire()]);

    renderScreen();
    await screen.findByTestId("qa-question-q-1");

    expect(screen.getByTestId("qa-awaiting-q-1")).toBeTruthy();
    expect(screen.getByText("No answer yet. A clinician will reply here.")).toBeTruthy();
    // The list-level spinner is gone once the read settles, and the row never
    // had one of its own.
    expect(screen.queryByTestId("qa-loading")).toBeNull();
  });

  it("renders the answer, attributed to a role rather than a person", async () => {
    mockGet.mockResolvedValue([
      qaWire({
        answer: "Brief dizziness on standing is usually postural.",
        answered_by_user_id: "doc-7",
        answered_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      }),
    ]);

    renderScreen();
    await screen.findByTestId("qa-question-q-1");

    expect(screen.getByText("Answered by a clinician")).toBeTruthy();
    expect(screen.getByText("Brief dizziness on standing is usually postural.")).toBeTruthy();
    expect(screen.queryByTestId("qa-awaiting-q-1")).toBeNull();
    expect(screen.queryByText(/doc-7/)).toBeNull();
  });
});

describe("empty, error and loading are three different answers", () => {
  it("shows the empty state for an empty array, and keeps the composer", async () => {
    mockGet.mockResolvedValue([]);

    renderScreen();

    expect(await screen.findByTestId("qa-empty")).toBeTruthy();
    expect(screen.queryByTestId("qa-error")).toBeNull();
    // The one control that can change the situation is still on screen.
    expect(screen.getByLabelText("Question input")).toBeTruthy();
  });

  it("shows the error state on a failed read, with a retry that refetches", async () => {
    mockGet.mockRejectedValueOnce(new Error("offline"));

    renderScreen();
    const panel = await screen.findByTestId("qa-error");
    expect(panel).toBeTruthy();
    expect(screen.queryByTestId("qa-empty")).toBeNull();

    mockGet.mockResolvedValue([qaWire()]);
    fireEvent.press(screen.getByLabelText("Retry loading questions"));

    expect(await screen.findByTestId("qa-question-q-1")).toBeTruthy();
  });

  it("keeps the composer on the error state too", async () => {
    mockGet.mockRejectedValue(new Error("offline"));

    renderScreen();
    await screen.findByTestId("qa-error");

    expect(screen.getByLabelText("Question input")).toBeTruthy();
  });
});

describe("asking", () => {
  it("sends the trimmed question with is_anonymous true by default", async () => {
    mockGet.mockResolvedValue([]);
    mockPost.mockResolvedValue(qaWire({ question_id: "q-new" }));

    renderScreen();
    await screen.findByTestId("qa-empty");

    fireEvent.changeText(screen.getByLabelText("Question input"), "  Why am I dizzy?  ");
    fireEvent.press(screen.getByLabelText("Send question"));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/v1/social/qa", {
        question: "Why am I dizzy?",
        is_anonymous: true,
      }),
    );
  });

  it("sends is_anonymous false once the asker turns anonymity off", async () => {
    mockGet.mockResolvedValue([]);
    mockPost.mockResolvedValue(qaWire({ question_id: "q-new", is_anonymous: false }));

    renderScreen();
    await screen.findByTestId("qa-empty");

    fireEvent.press(screen.getByLabelText("Ask anonymously"));
    fireEvent.changeText(screen.getByLabelText("Question input"), "Why am I dizzy?");
    fireEvent.press(screen.getByLabelText("Send question"));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/v1/social/qa", {
        question: "Why am I dizzy?",
        is_anonymous: false,
      }),
    );
  });

  it("will not send an empty or whitespace-only question", async () => {
    mockGet.mockResolvedValue([]);

    renderScreen();
    await screen.findByTestId("qa-empty");

    fireEvent.press(screen.getByLabelText("Send question"));
    fireEvent.changeText(screen.getByLabelText("Question input"), "   ");
    fireEvent.press(screen.getByLabelText("Send question"));

    expect(mockPost).not.toHaveBeenCalled();
  });

  it("shows a VISIBLE error when the ask fails, and keeps the draft", async () => {
    mockGet.mockResolvedValue([]);
    mockPost.mockRejectedValue(new Error("offline"));

    renderScreen();
    await screen.findByTestId("qa-empty");

    const input = screen.getByLabelText("Question input");
    fireEvent.changeText(input, "Why am I dizzy?");
    fireEvent.press(screen.getByLabelText("Send question"));

    expect(
      await screen.findByText("Couldn't send your question. Check your connection and try again."),
    ).toBeTruthy();
    // A retry must cost a tap, not a retype.
    expect(input.props.value).toBe("Why am I dizzy?");
  });

  it("clears the draft and confirms anonymity on success", async () => {
    mockGet.mockResolvedValue([]);
    mockPost.mockResolvedValue(qaWire({ question_id: "q-new" }));

    renderScreen();
    await screen.findByTestId("qa-empty");

    const input = screen.getByLabelText("Question input");
    fireEvent.changeText(input, "Why am I dizzy?");
    fireEvent.press(screen.getByLabelText("Send question"));

    expect(await screen.findByText("Question sent anonymously.")).toBeTruthy();
    await waitFor(() => expect(input.props.value).toBe(""));
  });
});

describe("the surface a patient does not get", () => {
  it("offers no way to answer a question", async () => {
    // `POST /v1/social/qa/{id}/answer` is doctor/admin only and is not wrapped
    // in this feature's client at all. This asserts the UI has no affordance
    // either, so the two cannot drift apart.
    mockGet.mockResolvedValue([qaWire()]);

    renderScreen();
    await screen.findByTestId("qa-question-q-1");

    expect(screen.queryByLabelText(/answer/i)).toBeNull();
    expect(screen.queryByText(/^Answer$/)).toBeNull();
  });

  it("offers no share or overflow on a row", async () => {
    mockGet.mockResolvedValue([qaWire()]);

    renderScreen();
    await screen.findByTestId("qa-question-q-1");

    expect(screen.queryByLabelText(/share/i)).toBeNull();
    expect(screen.queryByLabelText(/more options/i)).toBeNull();
    expect(screen.queryByLabelText(/report/i)).toBeNull();
  });
});

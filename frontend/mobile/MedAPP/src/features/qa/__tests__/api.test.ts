// qaApi — the path, the BARE ARRAY, and what the mapper refuses to carry.
//
// The screen suite mocks nothing below `@/lib/api/client`, but it still cannot
// prove the envelope: a screen that renders an empty list is indistinguishable
// from a screen whose mapper read `.items` off an array and got `undefined`. That
// is the `/v1/appointments` class of defect — green screens over a shape that
// does not exist — so the envelope is pinned here, directly.
//
// Three things are specifically defended:
//   1. `GET /v1/social/qa` returns a BARE ARRAY, not `{ items }`.
//   2. No user id survives the mapper, on any row, anonymous or not.
//   3. `is_anonymous` is sent EXPLICITLY and defaults TRUE — getting that
//      backwards deanonymises a patient health question.
//
// SEAM: `@/lib/api/client`.

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

import { bylineForQuestion, qaApi, qaKeys, QA_PATH, type QAEntry } from "../api";

const ANON_WIRE = {
  question_id: "q-1",
  // Absent, exactly as the service sends it for an anonymous row.
  author_user_id: null,
  author_role: "patient",
  question: "Is it normal to feel dizzy when I stand up quickly?",
  is_anonymous: true,
  moderation_status: "approved",
  answer: null,
  answered_by_user_id: null,
  answered_at: null,
  created_at: "2026-08-08T09:00:00Z",
  updated_at: "2026-08-08T09:00:00Z",
};

const ANSWERED_WIRE = {
  ...ANON_WIRE,
  question_id: "q-2",
  answer: "Brief dizziness on standing is usually postural.",
  answered_by_user_id: "doc-7",
  answered_at: "2026-08-08T10:00:00Z",
};

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
});

describe("listQA — the envelope", () => {
  it("reads a BARE ARRAY, not `{ items }`", async () => {
    mockGet.mockResolvedValue([ANON_WIRE, ANSWERED_WIRE]);

    const entries = await qaApi.listQA();

    expect(mockGet).toHaveBeenCalledWith("/v1/social/qa");
    expect(entries).toHaveLength(2);
    expect(entries[0].id).toBe("q-1");
    expect(entries[1].id).toBe("q-2");
  });

  it("does NOT reach for `.items` — an enveloped body yields nothing, loudly", async () => {
    // The regression guard, stated as the failure it prevents. If someone
    // "normalises" this route to the feed's shape, the array path breaks and
    // this test is what says so — rather than a screen quietly rendering empty.
    mockGet.mockResolvedValue({ items: [ANON_WIRE], next_offset: null });

    // A `{ items }` body is not an array, so nothing maps. The point is that the
    // client does not silently accept BOTH shapes: one of them is the contract.
    await expect(qaApi.listQA()).rejects.toThrow();
  });

  it("survives a null body without inventing rows", async () => {
    mockGet.mockResolvedValue(null);
    await expect(qaApi.listQA()).resolves.toEqual([]);
  });

  it("sends no limit or offset — the route is unpaged", async () => {
    mockGet.mockResolvedValue([]);
    await qaApi.listQA();
    expect(mockGet).toHaveBeenCalledWith(QA_PATH);
    expect(String(mockGet.mock.calls[0][0])).not.toContain("limit");
    expect(String(mockGet.mock.calls[0][0])).not.toContain("offset");
  });
});

describe("the mapper carries no identifiers for people", () => {
  it("drops author_user_id even when the server sends one", async () => {
    // A row the service should not emit, but that an older deployment did: the
    // flag says anonymous AND the id is present. The mapper must not care.
    mockGet.mockResolvedValue([{ ...ANON_WIRE, author_user_id: "u-leak" }]);

    const [entry] = await qaApi.listQA();

    expect(JSON.stringify(entry)).not.toContain("u-leak");
    expect(Object.keys(entry)).not.toContain("authorUserId");
  });

  it("drops answered_by_user_id too", async () => {
    mockGet.mockResolvedValue([ANSWERED_WIRE]);
    const [entry] = await qaApi.listQA();
    expect(JSON.stringify(entry)).not.toContain("doc-7");
    expect(Object.keys(entry)).not.toContain("answeredByUserId");
  });
});

describe("isAnswered", () => {
  it("is false when there is no answer — a legitimate state, not a gap", async () => {
    mockGet.mockResolvedValue([ANON_WIRE]);
    const [entry] = await qaApi.listQA();
    expect(entry.isAnswered).toBe(false);
    expect(entry.answer).toBeNull();
  });

  it("is true when there is one, and carries the timestamp", async () => {
    mockGet.mockResolvedValue([ANSWERED_WIRE]);
    const [entry] = await qaApi.listQA();
    expect(entry.isAnswered).toBe(true);
    expect(entry.answeredAtIso).toBe("2026-08-08T10:00:00Z");
  });

  it("treats a whitespace-only answer as unanswered", async () => {
    // Otherwise the row draws an empty tinted block under "Answered by a
    // clinician", which claims more than it delivers.
    mockGet.mockResolvedValue([{ ...ANSWERED_WIRE, answer: "   \n " }]);
    const [entry] = await qaApi.listQA();
    expect(entry.isAnswered).toBe(false);
  });
});

describe("askQuestion", () => {
  it("defaults is_anonymous to TRUE and sends it explicitly", async () => {
    mockPost.mockResolvedValue(ANON_WIRE);

    await qaApi.askQuestion("Why do I feel dizzy?");

    expect(mockPost).toHaveBeenCalledWith("/v1/social/qa", {
      question: "Why do I feel dizzy?",
      is_anonymous: true,
    });
  });

  it("sends false when the asker opted in", async () => {
    mockPost.mockResolvedValue({ ...ANON_WIRE, is_anonymous: false });

    await qaApi.askQuestion("Why do I feel dizzy?", false);

    expect(mockPost).toHaveBeenCalledWith("/v1/social/qa", {
      question: "Why do I feel dizzy?",
      is_anonymous: false,
    });
  });

  it("maps the created row through the same mapper, so no id comes back either", async () => {
    mockPost.mockResolvedValue({ ...ANON_WIRE, author_user_id: "u-leak" });
    const created = await qaApi.askQuestion("Why do I feel dizzy?");
    expect(JSON.stringify(created)).not.toContain("u-leak");
  });
});

describe("bylineForQuestion", () => {
  const base: QAEntry = {
    id: "q-1",
    authorName: null,
    authorRole: "patient",
    question: "?",
    isAnonymous: true,
    moderationStatus: "approved",
    answer: null,
    answeredAtIso: null,
    createdAtIso: ANON_WIRE.created_at,
    isAnswered: false,
  };

  it("says Anonymous for an anonymous question, and invents no name", () => {
    expect(bylineForQuestion(base)).toBe("Anonymous");
  });

  it("falls back to a neutral label for an attributed question with no name", () => {
    expect(bylineForQuestion({ ...base, isAnonymous: false })).toBe("MedApp member");
  });

  it("uses the name when there is one", () => {
    expect(bylineForQuestion({ ...base, isAnonymous: false, authorName: "Kwabena Osei" })).toBe(
      "Kwabena Osei",
    );
  });
});

describe("qaKeys", () => {
  it("is viewer-free — QAOut carries no per-viewer field", () => {
    // Deliberately unlike `socialKeys.feed`, which bakes the viewer in because
    // `liked_by_me`/`owned_by_me` are computed from the caller. Nothing on
    // `QAOut` is, so a viewer here would refetch on every sign-in for nothing.
    expect(qaKeys.list()).toEqual(["qa", "list"]);
  });
});

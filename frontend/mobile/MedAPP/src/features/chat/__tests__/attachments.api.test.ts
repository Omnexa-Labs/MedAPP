// The attachment wire, at the level the screen cannot cover.
//
// Every case here asserts a REQUEST or a mapping — the path, the multipart part,
// `duration_ms`, and the two shapes of `POST /messages` — because the defect this
// feature can most easily ship is a voice note that renders perfectly and posts
// to the wrong place, or posts without the duration the player is drawn from.

const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock("@/lib/api/client", () => ({
  client: {
    get: (...a: unknown[]) => mockGet(...a),
    post: (...a: unknown[]) => mockPost(...a),
  },
}));
jest.mock("@/lib/config", () => ({ config: { apiBaseUrl: "https://api.test" } }));
const mockGetAccessToken = jest.fn();
jest.mock("@/lib/storage/secure-storage", () => ({
  secureStorage: { getAccessToken: (...a: unknown[]) => mockGetAccessToken(...a) },
}));
jest.mock("@/lib/device/device-id", () => ({ getDeviceIdCached: () => "device-9" }));

import { ApiError } from "@/types/api";
import { chatApi, attachmentContentUri, attachmentAuthHeaders } from "../api";

/**
 * A recording FormData. React Native's own is native, and the DOM one in the
 * test env does not accept the `{ uri, name, type }` part shape the platform
 * requires — so the assertion is on what was appended, which is the thing that
 * can actually be wrong.
 */
class RecordingFormData {
  entries: [string, unknown][] = [];
  append(key: string, value: unknown) {
    this.entries.push([key, value]);
  }
}
const originalFormData = global.FormData;
const originalFetch = global.fetch;
const mockFetch = jest.fn();

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockFetch.mockReset();
  mockGetAccessToken.mockReset().mockResolvedValue("tok-1");
  (global as { FormData: unknown }).FormData = RecordingFormData;
  (global as { fetch: unknown }).fetch = mockFetch;
});
afterAll(() => {
  (global as { FormData: unknown }).FormData = originalFormData;
  (global as { fetch: unknown }).fetch = originalFetch;
});

const attachmentWire = (over: Record<string, unknown> = {}) => ({
  attachment_id: "a-1",
  thread_id: "t-1",
  message_id: null,
  uploader_user_id: "u-1",
  content_type: "audio/m4a",
  byte_size: 928,
  original_filename: "voice-note.m4a",
  duration_ms: 7400,
  created_at: "2026-08-08T10:20:20Z",
  ...over,
});

function jsonResponse(body: unknown, status = 201) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const lastForm = () => mockFetch.mock.calls[0][1].body as RecordingFormData;

describe("uploadAttachment", () => {
  it("POSTs multipart to /v1/threads/{id}/attachments", async () => {
    mockFetch.mockResolvedValue(jsonResponse(attachmentWire()));
    await chatApi.uploadAttachment("t-1", {
      uri: "file:///tmp/rec.m4a",
      name: "voice-note.m4a",
      mimeType: "audio/m4a",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.test/v1/threads/t-1/attachments");
    expect(init.method).toBe("POST");
    expect(lastForm().entries).toEqual([
      ["file", { uri: "file:///tmp/rec.m4a", name: "voice-note.m4a", type: "audio/m4a" }],
    ]);
  });

  it("sends duration_ms, and sends it as an integer string", async () => {
    // The server persists this so a player can be drawn without downloading the
    // audio. A float would be a 422 on a field the schema types as int.
    mockFetch.mockResolvedValue(jsonResponse(attachmentWire()));
    await chatApi.uploadAttachment("t-1", {
      uri: "file:///tmp/rec.m4a",
      name: "voice-note.m4a",
      mimeType: "audio/m4a",
      durationMs: 7400.62,
    });
    expect(lastForm().entries).toContainEqual(["duration_ms", "7401"]);
  });

  it("omits duration_ms entirely for a file that has none", async () => {
    mockFetch.mockResolvedValue(jsonResponse(attachmentWire({ duration_ms: null })));
    await chatApi.uploadAttachment("t-1", {
      uri: "file:///tmp/panel.pdf",
      name: "panel.pdf",
      mimeType: "application/pdf",
    });
    expect(lastForm().entries.map(([k]) => k)).toEqual(["file"]);
  });

  it("does NOT set Content-Type — the platform owns the multipart boundary", async () => {
    // Setting it by hand omits the boundary, and the server answers 422 in a way
    // that reads as a backend bug.
    mockFetch.mockResolvedValue(jsonResponse(attachmentWire()));
    await chatApi.uploadAttachment("t-1", {
      uri: "file:///tmp/rec.m4a",
      name: "voice-note.m4a",
      mimeType: "audio/m4a",
    });
    expect(mockFetch.mock.calls[0][1].headers["Content-Type"]).toBeUndefined();
  });

  it("carries the bearer token and the device id", async () => {
    mockFetch.mockResolvedValue(jsonResponse(attachmentWire()));
    await chatApi.uploadAttachment("t-1", {
      uri: "file:///tmp/rec.m4a",
      name: "voice-note.m4a",
      mimeType: "audio/m4a",
    });
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe("Bearer tok-1");
    expect(mockFetch.mock.calls[0][1].headers["X-Device-Id"]).toBe("device-9");
  });

  it("maps the response to the domain shape, duration included", async () => {
    mockFetch.mockResolvedValue(jsonResponse(attachmentWire()));
    const a = await chatApi.uploadAttachment("t-1", {
      uri: "file:///tmp/rec.m4a",
      name: "voice-note.m4a",
      mimeType: "audio/m4a",
      durationMs: 7400,
    });
    expect(a).toEqual({
      id: "a-1",
      threadId: "t-1",
      messageId: null,
      uploaderUserId: "u-1",
      contentType: "audio/m4a",
      byteSize: 928,
      originalFilename: "voice-note.m4a",
      durationMs: 7400,
      createdAtIso: "2026-08-08T10:20:20Z",
    });
  });

  it("surfaces the server's own message on a rejection, with its status", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ detail: "attachment exceeds the 8388608 byte limit" }, 413),
    );
    await expect(
      chatApi.uploadAttachment("t-1", {
        uri: "file:///tmp/big.m4a",
        name: "big.m4a",
        mimeType: "audio/m4a",
      }),
    ).rejects.toMatchObject({ status: 413, message: "attachment exceeds the 8388608 byte limit" });
  });

  it("turns a network failure into an ApiError with status 0", async () => {
    mockFetch.mockRejectedValue(new Error("Network request failed"));
    const err = await chatApi
      .uploadAttachment("t-1", {
        uri: "file:///tmp/rec.m4a",
        name: "voice-note.m4a",
        mimeType: "audio/m4a",
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(0);
  });
});

describe("sendMessage", () => {
  const messageWire = (over: Record<string, unknown> = {}) => ({
    message_id: "m-1",
    thread_id: "t-1",
    sender_user_id: "u-1",
    sender_role: "user",
    body: "",
    is_internal: false,
    created_at: "2026-08-08T10:21:00Z",
    attachments: [attachmentWire({ message_id: "m-1" })],
    ...over,
  });

  it("sends a voice note with an EMPTY body and the attachment id", async () => {
    // `body` may be "" when an attachment is present — that is the whole reason
    // a voice note needs no typed text.
    mockPost.mockResolvedValue(messageWire());
    const m = await chatApi.sendMessage("t-1", "", ["a-1"]);
    expect(mockPost).toHaveBeenCalledWith("/v1/threads/t-1/messages", {
      body: "",
      attachment_ids: ["a-1"],
    });
    expect(m.body).toBe("");
    expect(m.attachments[0].durationMs).toBe(7400);
  });

  it("leaves a body-only send BYTE-FOR-BYTE unchanged", async () => {
    // The regression the backend guards with
    // test_body_only_message_still_sends_unchanged, guarded from this side too:
    // `attachment_ids` must be ABSENT, not `[]`.
    mockPost.mockResolvedValue(messageWire({ body: "Plain text", attachments: [] }));
    await chatApi.sendMessage("t-1", "Plain text");
    expect(mockPost).toHaveBeenCalledWith("/v1/threads/t-1/messages", { body: "Plain text" });
  });

  it("omits attachment_ids for an empty array too", async () => {
    mockPost.mockResolvedValue(messageWire({ body: "Plain text", attachments: [] }));
    await chatApi.sendMessage("t-1", "Plain text", []);
    expect(mockPost).toHaveBeenCalledWith("/v1/threads/t-1/messages", { body: "Plain text" });
  });
});

describe("listMessages", () => {
  it("maps attachments through, and defaults a row without the key to []", async () => {
    // A client that ignores the key is unaffected — and so is one reading a
    // fixture or an older row that does not carry it.
    mockGet.mockResolvedValue([
      { message_id: "m-1", thread_id: "t-1", sender_user_id: "u-1", sender_role: "user", body: "hi", is_internal: false, created_at: "2026-08-08T10:00:00Z" },
      { message_id: "m-2", thread_id: "t-1", sender_user_id: "u-1", sender_role: "user", body: "", is_internal: false, created_at: "2026-08-08T10:01:00Z", attachments: [attachmentWire({ message_id: "m-2" })] },
    ]);
    const [a, b] = await chatApi.listMessages("t-1");
    expect(a.attachments).toEqual([]);
    expect(b.attachments).toHaveLength(1);
    expect(b.attachments[0].id).toBe("a-1");
  });
});

describe("the content path", () => {
  it("is composed from ids and is NOT a credential", async () => {
    // There is no url on the wire, deliberately: a link that grants access is a
    // bearer credential for a recording of a patient's symptoms. Possession of
    // the ids grants nothing — the token does.
    expect(attachmentContentUri("t-1", "a-1")).toBe(
      "https://api.test/v1/threads/t-1/attachments/a-1/content",
    );
    expect(attachmentContentUri("t-1", "a-1")).not.toMatch(/token|signature|expires|X-Amz/i);
  });

  it("supplies the normal bearer token for whoever streams it", async () => {
    await expect(attachmentAuthHeaders()).resolves.toEqual({
      Authorization: "Bearer tok-1",
      "X-Device-Id": "device-9",
    });
  });

  it("omits Authorization rather than sending a broken one when there is no token", async () => {
    mockGetAccessToken.mockRejectedValue(new Error("keystore unavailable"));
    await expect(attachmentAuthHeaders()).resolves.toEqual({ "X-Device-Id": "device-9" });
  });
});

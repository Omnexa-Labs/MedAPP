// Locks the post Share action, which shipped as a Pressable with no `onPress`.
//
// Named `.share` to stay out of the way of `.nav` and `.layout`, per the
// convention that file set already established.

import { screen, fireEvent, waitFor } from "@testing-library/react-native";
import { renderWithSafeArea as renderRaw } from "@/test/safe-area";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

function render(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderRaw(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));

// Same reason as CommunityScreen.nav.test.tsx: the real store pulls in
// @/lib/api/client -> @/lib/config, which throws without app.config.ts extras.
jest.mock("@/store/auth-store", () => ({
  useAuthStore: () => ({ user: null }),
}));

// The sheet is mocked at the module boundary; the mechanism is covered in
// src/lib/__tests__/share.test.ts.
const mockShareText = jest.fn(() => Promise.resolve("shared" as const));
jest.mock("@/lib/share", () => ({
  shareText: (...args: unknown[]) => mockShareText(...(args as [])),
}));

// CommunityScreen now reads the live feed, which pulls in the trio every
// migrated screen has needed: `./api` and `@/store/auth-store` both reach
// `@/lib/config`, whose readExtra() throws at require time under Jest, and
// react-query hooks cannot be conditional so a provider is mandatory.
// This suite presses Share ON A POST, so the mocked feed must return one -
// an empty feed renders <EmptyFeed /> and there is nothing to press.
jest.mock("../api", () => ({
  communityApi: {
    listFeed: jest.fn(async () => [
      {
        id: "p-1",
        kind: "blog",
        authorUserId: "u-1",
        authorRole: "doctor",
        authorName: "Dr. Kwabena Osei",
        title: "Managing blood pressure",
        body: "Keep a steady routine and log your readings each morning.",
        excerpt: null,
        tags: [],
        isAnonymous: false,
        moderationStatus: "approved",
        publishedAtIso: "2026-08-07T09:00:00Z",
        createdAtIso: "2026-08-07T09:00:00Z",
        likeCount: 3,
        commentCount: 2,
        isPublished: true,
      },
    ]),
    listQA: jest.fn(async () => []),
  },
}));

import { CommunityScreen, buildPostShareText } from "../CommunityScreen";

beforeEach(() => {
  mockShareText.mockClear();
});

describe("post share text", () => {
  const post = {
    id: "x",
    author: "Dr. Example",
    avatarUri: "https://example.test/a.png",
    role: "Cardiology",
    ago: "2h ago",
    body: "Log your blood pressure at the same time each day.",
    imageUri: "https://example.test/i.png",
    imageBadge: "Medical Journal",
    infoCard: { title: "Key Differentiator", text: "Itchy eyes point to allergies." },
    likes: 210,
    comments: 31,
    followedByUser: true,
  };

  it("carries attribution, the body and the inline info card", () => {
    const text = buildPostShareText(post);
    expect(text).toContain("Dr. Example · Cardiology");
    expect(text).toContain("Log your blood pressure at the same time each day.");
    expect(text).toContain("Key Differentiator: Itchy eyes point to allergies.");
    expect(text).toContain("Shared from the MedApp community.");
  });

  it("invents no permalink, no timestamp and no engagement figures", () => {
    const text = buildPostShareText(post);
    // There is no social backend and therefore no canonical post URL. A
    // synthesised one would 404 for whoever taps it.
    expect(text).not.toMatch(/https?:\/\//);
    // "2h ago" is relative to when the sharer opened the app, not to when the
    // recipient reads the message, and FeedPost carries no absolute instant.
    expect(text).not.toMatch(/2h ago/);
    // Counts, and a provenance badge for an image a text share cannot carry.
    expect(text).not.toMatch(/210|31 comments|Medical Journal/);
  });

  it("omits the info card cleanly when a post has none", () => {
    const text = buildPostShareText({ ...post, infoCard: undefined });
    expect(text).not.toMatch(/Key Differentiator|undefined/);
    expect(text).toContain("Dr. Example · Cardiology");
  });
});

describe("the Share control on a feed post", () => {
  it("opens the OS text sheet rather than doing nothing", async () => {
    render(<CommunityScreen />);

    // The feed is fetched now, so the first render is a spinner and the posts
    // arrive a tick later. Without this the press lands on an empty list.
    await waitFor(() => expect(screen.getAllByLabelText("Share").length).toBeGreaterThan(0));

    const shareButtons = screen.getAllByLabelText("Share");
    expect(shareButtons.length).toBeGreaterThan(0);
    fireEvent.press(shareButtons[0]);

    expect(mockShareText).toHaveBeenCalledTimes(1);
    const [message, options] = mockShareText.mock.calls[0] as unknown as [
      string,
      { dialogTitle?: string; subject?: string },
    ];
    expect(message.length).toBeGreaterThan(0);
    expect(options.dialogTitle).toBe("Share post");
    expect(message).not.toMatch(/https?:\/\//);
  });
});

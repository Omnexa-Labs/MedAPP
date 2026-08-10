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
jest.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => null,
  useIsAuthenticated: () => true,
}));

// The sheet is mocked at the module boundary; the mechanism is covered in
// src/lib/__tests__/share.test.ts.
const mockShareText = jest.fn(() => Promise.resolve("shared" as const));
jest.mock("@/lib/share", () => ({
  shareText: (...args: unknown[]) => mockShareText(...(args as [])),
}));

// The link builder is mocked too, and for a reason worth stating: under Jest
// there is no manifest, so the REAL `shareLinkFor` correctly returns null and
// every assertion about the URL would pass vacuously. Its own rules — the
// scheme check, the Expo Go refusal, the id-only query — are locked directly in
// src/lib/__tests__/share-links.test.ts. Here it stands in for a real build so
// this suite can assert what the share BODY does with the line it is given.
const mockShareLinkLine = jest.fn(
  (t: { kind: string; id: string }) => `Open in MedApp: medapp://${t.kind}-detail?id=${t.id}`,
);
jest.mock("@/lib/share-links", () => ({
  shareLinkLine: (...args: unknown[]) => mockShareLinkLine(...(args as [{ kind: string; id: string }])),
}));

// The seam is the HTTP client, not `../api` — see CommunityScreen.nav.test.tsx
// for why. This suite presses Share ON A POST, so the feed must return one: an
// empty feed renders <EmptyFeed /> and there is nothing to press.
jest.mock("@/lib/api/client", () => ({
  client: {
    get: jest.fn(async () => ({
      items: [
        {
          post_id: "p-1",
          kind: "blog",
          author_user_id: "u-1",
          author_role: "doctor",
          author_name: "Dr. Kwabena Osei",
          title: "Managing blood pressure",
          body: "Keep a steady routine and log your readings each morning.",
          excerpt: null,
          tags: [],
          is_anonymous: false,
          moderation_status: "approved",
          published_at: "2026-08-07T09:00:00Z",
          created_at: "2026-08-07T09:00:00Z",
          updated_at: "2026-08-07T09:00:00Z",
          like_count: 3,
          comment_count: 2,
          liked_by_me: false,
          bookmarked_by_me: false,
        },
      ],
      next_offset: null,
    })),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
  registerAuthTokenProvider: jest.fn(),
  registerDeviceIdProvider: jest.fn(),
}));

import { CommunityScreen, buildPostShareText } from "../CommunityScreen";

beforeEach(() => {
  mockShareText.mockClear();
  mockShareLinkLine.mockClear();
});

describe("post share text", () => {
  // Exactly the fields `toFeedPost` produces. The old fixture also carried
  // `avatarUri`, `imageUri`, `imageBadge`, `infoCard` and `followedByUser`,
  // none of which social_service returns — they came off the deleted mock, so
  // the suite was asserting the shape of fiction.
  const post = {
    id: "x",
    author: "Dr. Example",
    role: "Cardiology",
    ago: "2h ago",
    title: "Daily readings",
    excerpt: null,
    body: "Log your blood pressure at the same time each day.",
    likes: 210,
    comments: 31,
    liked: false,
    bookmarked: false,
    isOwn: false,
  };

  it("carries attribution and the body", () => {
    const text = buildPostShareText(post);
    expect(text).toContain("Dr. Example · Cardiology");
    expect(text).toContain("Log your blood pressure at the same time each day.");
    expect(text).toContain("Shared from the MedApp community.");
  });

  it("carries a link to THIS post, not a generic app link", () => {
    const text = buildPostShareText(post);
    // The whole point of the change: a recipient can open the thing they were
    // sent. `GET /v1/social/posts/{id}` shipped and PostDetailScreen queries it
    // directly, so the id in this URL is enough on a cold start.
    expect(mockShareLinkLine).toHaveBeenCalledWith({ kind: "post", id: "x" });
    expect(text).toContain("medapp://post-detail?id=x");
  });

  it("drops the link line entirely when there is no resolvable URL", () => {
    // Expo Go and web. The share goes out as the text it always was rather
    // than carrying an `exp://` LAN address into someone else's chat.
    mockShareLinkLine.mockReturnValueOnce(null as unknown as string);
    const text = buildPostShareText(post);
    expect(text).not.toMatch(/medapp:|exp:|https?:/);
    // and does not leave a hole where the line was
    expect(text).not.toMatch(/\n\n\n/);
    expect(text).toContain("Log your blood pressure at the same time each day.");
  });

  it("puts nothing but the post id in the link, and no timestamp or counts", () => {
    const text = buildPostShareText(post);
    // No web permalink: there is no site hosting one (see @/lib/share-links).
    expect(text).not.toMatch(/https?:\/\//);
    // No credential, no person. The author id never reaches this function —
    // `FeedPost` does not carry one — so it cannot reach the URL either.
    expect(text).not.toMatch(/token|session|jwt|bearer|authorization/i);
    expect(text).not.toContain("u-1");
    // "2h ago" is relative to when the sharer opened the app, not to when the
    // recipient reads the message, and FeedPost carries no absolute instant.
    expect(text).not.toMatch(/2h ago/);
    expect(text).not.toMatch(/210|31 comments/);
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
    // The feed row's own id, taken from the wire — proof the link is built per
    // post rather than from anything the screen happens to have in hand.
    expect(message).toContain("medapp://post-detail?id=p-1");
    expect(message).not.toMatch(/https?:\/\//);
  }, 20000);
});

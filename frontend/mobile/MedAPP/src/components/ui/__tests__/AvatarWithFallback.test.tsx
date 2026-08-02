// AvatarWithFallback's fallback chain, and the `neutral` tone added for the
// booking flow's practitioner avatar (Figma 780:5363).
//
// The chain is the point. docs/BRAND.md §App shell: "Avatars always need a real
// fallback (photo -> initials -> person silhouette). An empty coloured circle
// reads as a broken image, not as a placeholder." The three booking screens
// shipped a bare <Image> on a remote CDN URI, which offline — the normal case for
// this product's market — is a grey box.

import { Image } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { tokenColor } from "@/lib/tokens";

const mockScheme = { value: "light" as "light" | "dark" };
jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: mockScheme.value, setColorScheme: jest.fn() }),
}));

import { Icon } from "../icons/Icon";
import { AvatarWithFallback } from "../AvatarWithFallback";

beforeEach(() => {
  mockScheme.value = "light";
});

describe("AvatarWithFallback — the chain", () => {
  it("prefers the photo", () => {
    render(<AvatarWithFallback uri="https://example.test/a.jpg" initials="ES" label="Dr. Sterling" />);
    expect(screen.UNSAFE_getAllByType(Image)).toHaveLength(1);
  });

  it("falls back to initials", () => {
    render(<AvatarWithFallback initials="ES" label="Dr. Sterling" />);
    expect(screen.getByText("ES")).toBeTruthy();
  });

  it("falls back to a real silhouette, never a blank tint", () => {
    render(<AvatarWithFallback label="Dr. Sterling" />);
    expect(screen.UNSAFE_getAllByType(Icon)[0].props.chrome).toBe("person");
  });

  it("is always named, whichever rung of the chain rendered", () => {
    render(<AvatarWithFallback label="Dr. Sterling" />);
    expect(screen.getByLabelText("Dr. Sterling")).toBeTruthy();
  });
});

describe("AvatarWithFallback — the `neutral` tone (780:5363)", () => {
  it("tints its silhouette `on-surface-variant`, the pair for its plate", () => {
    // The accent in the practitioner row belongs to the verified badge; two
    // teals stacked on one 56px circle read as a rendering error.
    render(<AvatarWithFallback tone="neutral" size={56} label="Dr. Sterling" />);
    expect(screen.UNSAFE_getAllByType(Icon)[0].props.color).toBe(
      tokenColor("on-surface-variant", "light"),
    );
  });

  it("re-resolves per mode, so the glyph and the plate flip together", () => {
    mockScheme.value = "dark";
    render(<AvatarWithFallback tone="neutral" size={56} label="Dr. Sterling" />);
    const dark = screen.UNSAFE_getAllByType(Icon)[0].props.color;
    expect(dark).toBe(tokenColor("on-surface-variant", "dark"));
    expect(dark).not.toBe(tokenColor("on-surface-variant", "light"));
  });
});

// AvatarWithFallback's fallback chain, and the `neutral` tone added for the
// booking flow's practitioner avatar (Figma 780:5363).
//
// The chain is the point. docs/BRAND.md §App shell: "Avatars always need a real
// fallback (photo -> initials -> person silhouette). An empty coloured circle
// reads as a broken image, not as a placeholder." The three booking screens
// shipped a bare <Image> on a remote CDN URI, which offline — the normal case for
// this product's market — is a grey box.

import { Image } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
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

describe("AvatarWithFallback — a URI that exists but does not load", () => {
  // The gap this closes: the component branched on `uri` being truthy, so a
  // URL that merely EXISTS beat the fallback chain. A dead link therefore
  // rendered an empty circle — precisely the "broken image, not a placeholder"
  // outcome BRAND names — and it is the COMMON path here, because doctor
  // profiles routinely carry a photo_url pointing at a host that never
  // resolves. Caught by putting real seeded data on the appointments screen and
  // looking at it: two clinicians, two blank holes.
  it("falls through to initials once the image reports an error", () => {
    render(
      <AvatarWithFallback
        uri="https://images.medapp.dev/doctors/does-not-resolve.jpg"
        initials="KO"
        label="Dr. Kwabena Osei"
        size={56}
      />,
    );

    expect(screen.queryByText("KO")).toBeNull();
    fireEvent(screen.UNSAFE_getByType(Image), "error");
    expect(screen.getByText("KO")).toBeTruthy();
  });

  it("retries for a new person rather than inheriting the last one's failure", () => {
    // List rows recycle. Without the reset, one broken photo would suppress
    // every subsequent avatar in the same slot.
    const { rerender } = render(
      <AvatarWithFallback uri="https://bad.test/a.jpg" initials="AA" label="A" size={56} />,
    );
    fireEvent(screen.UNSAFE_getByType(Image), "error");
    expect(screen.getByText("AA")).toBeTruthy();

    rerender(
      <AvatarWithFallback uri="https://good.test/b.jpg" initials="BB" label="B" size={56} />,
    );
    expect(screen.queryByText("BB")).toBeNull();
    expect(screen.UNSAFE_getByType(Image)).toBeTruthy();
  });
});

// Covers the icon system end to end: the Health Icons registry resolves through
// Metro's SVG transformer (mocked under Jest), and <Icon /> renders both the
// clinical set and the MaterialIcons chrome fallback.
import { render, screen } from "@testing-library/react-native";
import { Icon } from "@/components/ui";
import { HEALTH_ICONS } from "../registry";

describe("Health Icons registry", () => {
  it("registers a meaningful set of clinical icons", () => {
    expect(Object.keys(HEALTH_ICONS).length).toBeGreaterThan(40);
  });

  it("uses kebab-case semantic names, not vendor paths", () => {
    for (const name of Object.keys(HEALTH_ICONS)) {
      expect(name).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("every entry renders", () => {
    for (const Glyph of Object.values(HEALTH_ICONS)) {
      const { unmount } = render(<Glyph width={24} height={24} color="#00685f" />);
      unmount();
    }
  });
});

describe("Icon", () => {
  it("renders a clinical glyph and exposes its label", () => {
    render(<Icon name="blood-pressure" label="Blood pressure" />);
    expect(screen.getByLabelText("Blood pressure")).toBeTruthy();
  });

  it("renders chrome via the MaterialIcons fallback", () => {
    render(<Icon chrome="arrow-back" label="Back" />);
    expect(screen.getByLabelText("Back")).toBeTruthy();
  });

  it("hides decorative icons from assistive tech", () => {
    render(<Icon name="medication" />);
    expect(screen.queryByLabelText("medication")).toBeNull();
  });
});

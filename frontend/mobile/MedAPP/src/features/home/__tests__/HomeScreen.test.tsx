// Locks the Quick Services strip — specifically the tile that reconnects the
// new-booking funnel.
//
// The bug this round exists to fix is not "a screen renders wrong", it is "a
// route exists and nothing reaches it": `find-care` is designed, built and
// backend-wired, and until now no file in src/features linked to it. A test that
// only asserted the tile RENDERS would have passed against a decorative tile
// with no `onPress`, which is the exact defect. So the assertions here are about
// the push and its target, not the pixels.

import { fireEvent, screen } from "@testing-library/react-native";
import { renderWithSafeArea as render } from "@/test/safe-area";

// HomeScreen is the app's ONLY Reanimated consumer (the MedAI hero's `ai-pulse`
// loop), which is why no other suite has needed this. Under Jest the Worklets
// native module doesn't exist, so importing the real package throws at require
// time and the suite never runs at all.
//
// The library's own `react-native-reanimated/mock` does not help: it re-imports
// `./index` for its enums, so requiring it detonates the same native
// initialiser it is supposed to stand in for. Hence this stub, kept to exactly
// the six bindings HomeScreen imports — a wider fake would start asserting an
// animation API this screen doesn't use.
//
// Nothing is lost by faking it. The pulse is a decorative blob behind the hero
// card, and every assertion below is about navigation.
jest.mock("react-native-reanimated", () => {
  const { View } = require("react-native");
  const identityEasing = (t: number) => t;
  return {
    __esModule: true,
    default: { View },
    Easing: { inOut: () => identityEasing, ease: identityEasing },
    useSharedValue: (value: number) => ({ value }),
    useAnimatedStyle: () => ({}),
    withRepeat: (animation: unknown) => animation,
    withTiming: (toValue: number) => toValue,
  };
});

// The store itself is mocked, not seeded: importing `@/store/auth-store` pulls
// in `@/lib/api/client` -> `@/lib/config`, which throws unless app.config.ts
// extras are present. Same reason (and same shape) as the LifestyleHubScreen
// suite's `use-current-user` mock. A signed-in user with no display name is the
// screen's own fallback path ("Good morning, there") and changes nothing the
// tests below look at.
jest.mock("@/store/auth-store", () => ({
  useAuthStore: (selector: (state: { user: null }) => unknown) => selector({ user: null }),
}));

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => true,
  },
}));

import { HomeScreen } from "../HomeScreen";

describe("HomeScreen — Quick Services", () => {
  beforeEach(() => mockPush.mockClear());

  it("carries a Find Care tile that pushes the provider directory", () => {
    render(<HomeScreen />);

    fireEvent.press(screen.getByLabelText("Find Care"));

    // `find-care` is a directory ROOT: it reads no params and has no
    // param-dependent empty state, so a bare pathname is a complete link. The
    // assertion is exact rather than `objectContaining` for that reason — if
    // this screen ever starts passing params, that is a change worth failing on.
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/(app)/find-care");
  });

  it("keeps every tile that already shipped, and their targets", () => {
    render(<HomeScreen />);

    for (const label of ["Find Care", "Appts", "Pharmacy", "Labs", "Vitals", "Records"]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }

    // Appts is the strip's only other routed tile; the remaining four are
    // deliberate visual stubs until their features ship.
    fireEvent.press(screen.getByLabelText("Appts"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/appointments");

    mockPush.mockClear();
    for (const label of ["Pharmacy", "Labs", "Vitals", "Records"]) {
      fireEvent.press(screen.getByLabelText(label));
    }
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("lays the six tiles out as two rows of three, not one row of six", () => {
    // Not a style assertion for its own sake. One row of six puts a 48px tile
    // in a 328px column at 360dp — narrower than the 56px icon plate inside it,
    // and narrow enough to ellipsise "Pharmacy". BRAND: "nothing is half-sliced
    // in the resting state". If someone flattens this back to a single row the
    // strip silently starts clipping, and only this assertion notices.
    render(<HomeScreen />);

    // Walk up to the nearest strip row rather than reading `.parent` directly:
    // a tile's immediate parent is its own Pressable's host wrapper, several
    // levels below the row (NativeWind adds wrappers of its own), so `.parent`
    // is never shared even when two tiles genuinely sit side by side.
    const ROW = "flex-row gap-base";
    // Narrowed to the two fields the walk needs. `ReactTestInstance.parent` is
    // typed as non-nullable, which would make the loop's own termination
    // condition unreachable to the compiler.
    type Ancestor = { props: { className?: string }; parent: Ancestor | null };
    const rowOf = (label: string) => {
      let node = screen.getByLabelText(label) as unknown as Ancestor | null;
      while (node && node.props?.className !== ROW) node = node.parent;
      if (!node) throw new Error(`"${label}" is not inside a Quick Services row`);
      return node;
    };
    // Compared as a BOOLEAN, not `expect(a).toBe(b)` on the nodes themselves.
    // A failing identity assertion makes Jest pretty-print both React trees, and
    // a rendered HomeScreen is large enough that the diff exhausts the worker's
    // heap — the suite dies with an OOM instead of telling you what broke.
    const sameRow = (a: string, b: string) => rowOf(a) === rowOf(b);

    // Three per row…
    expect(sameRow("Find Care", "Appts")).toBe(true);
    expect(sameRow("Find Care", "Pharmacy")).toBe(true);
    expect(sameRow("Labs", "Vitals")).toBe(true);
    expect(sameRow("Labs", "Records")).toBe(true);
    // …in two distinct rows, which is what makes this a wrap and not a reorder.
    expect(sameRow("Find Care", "Labs")).toBe(false);

    // Each tile is flex-1 inside its row, so three of them divide the content
    // column exactly on whatever width the device actually reports.
    expect(String(screen.getByLabelText("Find Care").props.className)).toContain("flex-1");
  });

  it("still routes the Upcoming Appointments section header", () => {
    render(<HomeScreen />);

    fireEvent.press(screen.getByLabelText("View All Upcoming Appointments"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/appointments");
  });
});

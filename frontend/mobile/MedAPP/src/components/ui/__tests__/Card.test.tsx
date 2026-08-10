// Locks the card's elevation contract, which is: THERE IS NO ELEVATION.
//
// docs/BRAND.md, "Elevation — cards do NOT cast a drop shadow". The shadow has
// now been rejected twice by the product owner and removed twice from the code,
// so the rule is asserted here rather than left to a comment: a Card must emit
// no `shadowColor`, no `shadowOpacity`, no `shadowRadius`, no `shadowOffset` and
// no Android `elevation` — in any mode, with or without `flat`.
//
// `elevation` is called out separately because Android draws its rim from that
// number alone and ignores `shadowOpacity` entirely, so "faded to 0 opacity" is
// not the same as "absent".

import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { Card } from "../Card";

/** Flattens RN's style array into one object. */
function flatStyle(node: { props: { style?: unknown } }) {
  const style = node.props.style;
  return Array.isArray(style) ? Object.assign({}, ...style.flat().filter(Boolean)) : style;
}

const SHADOW_PROPS = [
  "shadowColor",
  "shadowOpacity",
  "shadowRadius",
  "shadowOffset",
  "elevation",
] as const;

describe("Card", () => {
  it("emits no shadow and no elevation at all", () => {
    render(
      <Card testID="card">
        <Text>body</Text>
      </Card>,
    );
    const style = flatStyle(screen.getByTestId("card")) ?? {};
    for (const prop of SHADOW_PROPS) {
      expect(style[prop]).toBeUndefined();
    }
  });

  it("still emits no shadow when flat, so the prop stays safe to pass", () => {
    render(
      <Card flat testID="card">
        <Text>body</Text>
      </Card>,
    );
    const style = flatStyle(screen.getByTestId("card")) ?? {};
    for (const prop of SHADOW_PROPS) {
      expect(style[prop]).toBeUndefined();
    }
  });

  it("keeps a caller's own style prop, which is how insets are overridden", () => {
    render(
      <Card testID="card" style={{ padding: 16 }}>
        <Text>body</Text>
      </Card>,
    );
    expect(flatStyle(screen.getByTestId("card")).padding).toBe(16);
  });

  // The regression this suite previously missed. Removing the shadow from the
  // primitive was not sufficient: PatientDashboardScreen passed a full
  // Platform.select shadow object in through `style`, so a shadowed card shipped
  // while every test here still passed. `style` must remain usable for insets
  // and refuse elevation at the same time.
  it("refuses elevation injected through style, while keeping the rest of it", () => {
    render(
      <Card
        testID="card"
        style={{
          padding: 16,
          shadowColor: "#000000",
          shadowOpacity: 0.06,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
        }}
      >
        <Text>body</Text>
      </Card>,
    );
    const style = flatStyle(screen.getByTestId("card")) ?? {};
    for (const prop of SHADOW_PROPS) {
      expect(style[prop]).toBeUndefined();
    }
    // The non-elevation part of the caller's style must survive, or the strip
    // would be a breaking change for every inset override.
    expect(style.padding).toBe(16);
  });

  it("refuses a boxShadow too, which is what RN Web and RN 0.76+ accept", () => {
    render(
      <Card testID="card" style={{ boxShadow: "0px 2px 8px rgba(0,0,0,0.06)" } as object}>
        <Text>body</Text>
      </Card>,
    );
    expect(flatStyle(screen.getByTestId("card"))?.boxShadow).toBeUndefined();
  });
});

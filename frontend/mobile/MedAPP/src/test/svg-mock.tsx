// Stand-in for .svg imports under Jest.
//
// Metro compiles .svg into a react-native-svg component via
// react-native-svg-transformer, but Jest doesn't run Metro, so without this the
// raw XML reaches the JS parser and every test touching an icon fails with
// "Unexpected token '<'". Mapped in jest.config.js -> moduleNameMapper.
//
// Renders a View carrying the props through, so tests can still assert size and
// colour wiring without depending on glyph geometry.
import { View, type DimensionValue, type ViewProps } from "react-native";

interface SvgMockProps extends ViewProps {
  // DimensionValue rather than number | string: react-native-svg accepts both,
  // but only RN's own dimension union is valid in a style object.
  width?: DimensionValue;
  height?: DimensionValue;
  color?: string;
}

export default function SvgMock({ width, height, color, ...rest }: SvgMockProps) {
  return <View accessibilityLabel="svg-mock" style={{ width, height }} {...rest} />;
}

// Metro config for Expo SDK 55 + NativeWind v4 + SVG icons.
//
// `withNativeWind` injects the Tailwind transform; `input` is the entry CSS.
// The SVG transformer lets us import Health Icons' raw .svg files as React
// components (see src/components/ui/icons/), so icons stay real vectors that
// inherit `color` instead of being shipped as PNGs.
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// --- SVG-as-component support -------------------------------------------------
// "svg" has to move out of assetExts (where Metro would treat it as an image)
// and into sourceExts (where the transformer can compile it to a component).
config.transformer.babelTransformerPath = require.resolve("react-native-svg-transformer/expo");
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== "svg");
config.resolver.sourceExts = [...config.resolver.sourceExts, "svg"];

module.exports = withNativeWind(config, { input: "./global.css" });

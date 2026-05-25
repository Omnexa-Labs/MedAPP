// Metro config for Expo SDK 55 + NativeWind v4.
// `withNativeWind` injects the Tailwind transform; `input` is the entry CSS.
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: "./global.css" });

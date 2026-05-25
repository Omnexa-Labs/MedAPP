// Babel config for Expo SDK 55 + NativeWind v4.
// `jsxImportSource: "nativewind"` rewrites JSX so `className` works on RN.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
  };
};

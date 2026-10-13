// Expo SDK 52+ detects the npm workspace automatically (watchFolders,
// nodeModulesPaths), so `@thestats/app` and `@thestats/core` resolve to
// their TypeScript sources without extra resolver config.
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: "./src/global.css" });

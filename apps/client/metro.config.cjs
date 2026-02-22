const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Production minification: drop console.log/info, keep warn/error (Phase 3)
config.transformer = {
  ...config.transformer,
  minifierPath: "metro-minify-terser",
  minifierConfig: {
    compress: { drop_console: ["log", "info"] },
  },
};

module.exports = withNativeWind(config, {
  input: "./app/global.css",
});

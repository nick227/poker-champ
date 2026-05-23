const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const exclusionList = require("metro-config/src/defaults/exclusionList");

const config = getDefaultConfig(__dirname);

// Run scripts/clean-pnpm-hoist-stubs.cjs before dev:web (Windows pnpm shamefully-hoist junctions).
config.resolver = {
  ...config.resolver,
  blockList: exclusionList([
    /[/\\]\.ignored_.*/,
    /node_modules[/\\]\.pnpm[/\\]node_modules[/\\]/,
    /node_modules[/\\]@eslint[/\\]/,
    /node_modules[/\\]@typescript-eslint[/\\]/,
    /node_modules[/\\]eslint-plugin-react[/\\]?/,
    /node_modules[/\\]eslint-plugin-react-hooks[/\\]?/,
    /node_modules[/\\]eslint-scope[/\\]?/,
    /node_modules[/\\]eslint-visitor-keys[/\\]?/,
    /[/\\]rollup-linux-[^/\\]+[/\\]?/,
    /[/\\]rollup-darwin-[^/\\]+[/\\]?/,
    /[/\\]@esbuild[/\\]linux-[^/\\]+[/\\]?/,
  ]),
};

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

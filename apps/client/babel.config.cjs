const transformClassStaticBlock = require("@babel/plugin-transform-class-static-block").default;

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo", "nativewind/babel"],
    plugins: [transformClassStaticBlock, "react-native-reanimated/plugin"],
  };
};

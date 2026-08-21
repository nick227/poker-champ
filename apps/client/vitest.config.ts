import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    environmentMatchGlobs: [
      ["src/features/table/components/table/hooks/__tests__/**/*.test.ts", "happy-dom"],
      ["src/voice/sdk/LocalAudioTrack.test.ts", "happy-dom"],
    ],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["src/test/setup.ts"],
    server: {
      deps: {
        inline: [
          "react-native",
          "expo",
          "expo-router",
          "@react-navigation/native",
          "expo-secure-store",
          "react-native-mmkv",
        ],
      },
    },
  },
  resolve: {
    alias: [
      {
        find: /\.(mp3|wav|ogg|png|jpg|jpeg|gif|webp|svg)$/,
        replacement: path.resolve(process.cwd(), "src/test/mocks/assetStub.ts"),
      },
      { find: "@", replacement: path.resolve(process.cwd(), "src") },
      {
        find: "react-native",
        replacement: path.resolve(process.cwd(), "src/__mocks__/react-native.ts"),
      },
      {
        find: /^react-native\/.*/,
        replacement: path.resolve(process.cwd(), "src/__mocks__/react-native.ts"),
      },
      {
        find: "expo-secure-store",
        replacement: path.resolve(process.cwd(), "src/__mocks__/expo-secure-store.ts"),
      },
      {
        find: "react-native-mmkv",
        replacement: path.resolve(process.cwd(), "src/__mocks__/react-native-mmkv.ts"),
      },
      {
        find: "expo-router",
        replacement: path.resolve(process.cwd(), "src/__mocks__/expo-router.ts"),
      },
      {
        find: "nativewind",
        replacement: path.resolve(process.cwd(), "src/__mocks__/nativewind.ts"),
      },
    ],
  },
});

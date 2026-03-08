import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/tests/**/*.test.ts"],
    setupFiles: ["src/test/setup.ts"],
    server: {
      deps: {
        external: ["react-native", "expo", "expo-secure-store", "react-native-mmkv"],
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
        find: "expo-secure-store",
        replacement: path.resolve(process.cwd(), "src/__mocks__/expo-secure-store.ts"),
      },
      {
        find: "react-native-mmkv",
        replacement: path.resolve(process.cwd(), "src/__mocks__/react-native-mmkv.ts"),
      },
    ],
  },
});

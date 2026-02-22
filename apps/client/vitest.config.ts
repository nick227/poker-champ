import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/tests/**/*.test.ts"],
    server: {
      deps: {
        external: ["react-native", "expo", "expo-secure-store"],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
      "react-native": path.resolve(process.cwd(), "src/__mocks__/react-native.ts"),
      "expo-secure-store": path.resolve(process.cwd(), "src/__mocks__/expo-secure-store.ts"),
    },
  },
});

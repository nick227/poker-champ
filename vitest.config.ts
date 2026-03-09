import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@poker-champ/api-types": path.resolve(process.cwd(), "packages/api-types/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    globalSetup: ["./vitest.global-setup.ts"],
    include: [
      "apps/server/src/**/*.test.ts",
      "apps/server/src/**/__tests__/**/*.test.ts"
    ],
    coverage: {
      reporter: ["text", "html"]
    }
  }
});

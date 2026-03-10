import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@poker-champ/realtime-contract": path.resolve(process.cwd(), "packages/realtime-contract/src/index.ts"),
      "@poker-champ/db": path.resolve(process.cwd(), "packages/db/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    globalSetup: ["./vitest.global-setup.ts"],
    include: [
      "apps/server/src/awards/evaluateLessonAwards.test.ts",
      "apps/server/src/awards/evaluateHandAwards.test.ts",
      "apps/server/src/awards/AwardService.test.ts",
      "apps/server/src/http/__tests__/AwardsRouter.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "apps/server/src/awards/**/*.ts",
        "apps/server/src/http/AwardsRouter.ts",
      ],
      exclude: [
        "apps/server/src/**/*.test.ts",
        "apps/server/src/**/__tests__/**/*.test.ts",
      ],
    },
  },
});

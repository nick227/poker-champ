import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./vitest.global-setup.ts"],
    include: [
      "apps/server/src/tests/evaluateLessonAwards.test.ts",
      "apps/server/src/tests/evaluateHandAwards.test.ts",
      "apps/server/src/tests/AwardService.test.ts",
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

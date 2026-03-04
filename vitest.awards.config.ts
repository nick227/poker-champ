import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./vitest.global-setup.ts"],
    include: [
      "src/tests/evaluateLessonAwards.test.ts",
      "src/tests/evaluateHandAwards.test.ts",
      "src/tests/AwardService.test.ts",
      "src/http/__tests__/AwardsRouter.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/awards/**/*.ts",
        "src/http/AwardsRouter.ts",
      ],
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**/*.test.ts",
      ],
    },
  },
});

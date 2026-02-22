import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PLAYWRIGHT_WEB_PORT ?? 8081;
const baseURL = `http://localhost:${PORT}`;
const apiBaseURL = process.env.PLAYWRIGHT_API_URL ?? process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:2567";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --dir ../.. exec tsx src/index.ts",
      url: `${apiBaseURL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command:
        "set EXPO_PUBLIC_API_URL=http://localhost:2567&& set EXPO_PUBLIC_COLYSEUS_URL=ws://localhost:2567&& pnpm exec expo start --web",
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});

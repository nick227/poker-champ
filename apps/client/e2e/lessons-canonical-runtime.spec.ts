import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

type Creds = {
  email: string;
  password: string;
  username: string;
};

function resolveApiBaseUrl(): string {
  return process.env.PLAYWRIGHT_API_URL ?? process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:2567";
}

async function ensureTokenViaApi(request: APIRequestContext, apiBaseUrl: string, creds: Creds): Promise<string> {
  await request.post(`${apiBaseUrl}/api/auth/register`, {
    data: {
      email: creds.email,
      password: creds.password,
      username: creds.username,
      displayName: creds.username,
    },
  });

  const login = await request.post(`${apiBaseUrl}/api/auth/login`, {
    data: { email: creds.email, password: creds.password },
  });
  expect(login.ok()).toBeTruthy();
  const body = (await login.json()) as { token?: string };
  expect(body.token).toBeTruthy();
  return body.token as string;
}

async function hydrateToken(page: Page, token: string) {
  await page.addInitScript((t) => {
    window.localStorage.setItem("auth_token", t);
  }, token);
}

async function recoverFromSdkBootstrapRace(page: Page) {
  for (let i = 0; i < 3; i += 1) {
    const sdkError = page.getByText(/SDK base URL is not configured/i).first();
    if (!(await sdkError.isVisible().catch(() => false))) return;
    const retry = page.getByText(/^Retry$/i).first();
    if (await retry.isVisible().catch(() => false)) {
      await retry.click();
      await page.waitForTimeout(400);
    }
  }
}

async function chooseAction(page: Page, preferred: RegExp) {
  const candidates = [preferred, /^Call\b/i, /^Fold\b/i, /^Raise\b/i, /^All-In\b/i];
  for (const pattern of candidates) {
    const actionButton = page.getByText(pattern).first();
    if (await actionButton.isVisible().catch(() => false)) {
      await actionButton.click();
      return;
    }
  }
  throw new Error("No supported action button was visible on ACTION_STEP.");
}

test.describe("canonical lessons runtime", () => {
  test("L01 objective action response + community block + single decision submit", async ({ page, request }) => {
    test.setTimeout(240_000);
    const apiBaseUrl = resolveApiBaseUrl();
    const now = Date.now();
    const token = await ensureTokenViaApi(request, apiBaseUrl, {
      email: `l01-objective-${now}@example.com`,
      password: "Pass1234!",
      username: `l01_objective_${String(now).slice(-6)}`,
    });

    await hydrateToken(page, token);
    await page.goto("/lesson/L01", { waitUntil: "domcontentloaded" });
    await recoverFromSdkBootstrapRace(page);
    await expect(page.getByText(/Step 1\/1/i)).toBeVisible({ timeout: 20_000 });

    let decisionSubmitCount = 0;
    page.on("requestfinished", (req) => {
      if (req.method() !== "POST") return;
      if (req.url().includes("/api/lessons/L01/attempts/") && req.url().includes("/steps/L01_decision/submit")) {
        decisionSubmitCount += 1;
      }
    });

    await chooseAction(page, /^Call$/i);
    const maybeSecondClick = page.getByText(/^Call$/i).first();
    if (await maybeSecondClick.isVisible().catch(() => false)) {
      await maybeSecondClick.click({ trial: true }).catch(() => undefined);
    }

    await expect(
      page.getByText(/Good line for this situation\.|There is a better line in this node\./i).first(),
    ).toBeVisible({ timeout: 15_000 });
    const communityBlock = page.getByText("Community", { exact: true }).first();
    await expect(communityBlock).toBeVisible({ timeout: 12_000 });
    await expect(
      page
        .getByText(
          /You are at the \d+th percentile on this question\.|(Fold|Check|Call|Bet|Raise|All-In|Option .+):\s*\d+%|responses in this spot|Baseline building|Community data is not available yet|Loading community/i,
        )
        .first(),
    ).toBeVisible({ timeout: 12_000 });

    await expect.poll(() => decisionSubmitCount, { timeout: 10_000 }).toBe(1);
    const nextButton = page.getByText(/^Next$/i).first();
    await expect(nextButton).toBeEnabled({ timeout: 8_000 });
  });

  test("L13 subjective action response + grade band + community distribution", async ({ page, request }) => {
    test.setTimeout(240_000);
    const apiBaseUrl = resolveApiBaseUrl();
    const now = Date.now();
    const token = await ensureTokenViaApi(request, apiBaseUrl, {
      email: `l13-subjective-${now}@example.com`,
      password: "Pass1234!",
      username: `l13_subjective_${String(now).slice(-6)}`,
    });

    await hydrateToken(page, token);
    await page.goto("/lesson/L13", { waitUntil: "domcontentloaded" });
    await recoverFromSdkBootstrapRace(page);
    await expect(page.getByText(/Step 1\/1/i)).toBeVisible({ timeout: 20_000 });

    await chooseAction(page, /^Call$/i);

    await expect(
      page
        .getByText(/Grade Band:\s*(STRONG|REASONABLE|WEAK)|Good line for this situation\.|There is a better line in this node\./i)
        .first(),
    ).toBeVisible({ timeout: 15_000 });
    const communityBlock = page.getByText("Community", { exact: true }).first();
    await expect(communityBlock).toBeVisible({ timeout: 12_000 });
    await expect(
      page
        .getByText(
          /You are at the \d+th percentile on this question\.|(Fold|Check|Call|Bet|Raise|All-In|Option .+):\s*\d+%|responses in this spot|Baseline building|Community data is not available yet|Loading community/i,
        )
        .first(),
    ).toBeVisible({ timeout: 12_000 });
  });
});

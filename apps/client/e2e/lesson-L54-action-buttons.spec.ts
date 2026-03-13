/**
 * E2E: Replicate lesson action buttons (Fold / Check-Bet) not clickable in browser.
 * Run: pnpm e2e e2e/lesson-L54-action-buttons.spec.ts
 * Or with app already on http://localhost:8081: PLAYWRIGHT_REUSE_SERVER=1 pnpm e2e e2e/lesson-L54-action-buttons.spec.ts
 * Fails if the table action buttons do not respond to click.
 */
import { expect, test, type APIRequestContext, type Page } from "./test";

function resolveApiBaseUrl(): string {
  return process.env.PLAYWRIGHT_API_URL ?? process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:2567";
}

async function ensureTokenViaApi(request: APIRequestContext, apiBaseUrl: string) {
  const now = Date.now();
  await request.post(`${apiBaseUrl}/api/auth/register`, {
    data: {
      email: `e2e-l54-${now}@example.com`,
      password: "Pass1234!",
      username: `e2e_l54_${String(now).slice(-6)}`,
      displayName: `e2e_l54_${String(now).slice(-6)}`,
    },
  });
  const login = await request.post(`${apiBaseUrl}/api/auth/login`, {
    data: { email: `e2e-l54-${now}@example.com`, password: "Pass1234!" },
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

/** Find and click one of the table action bar buttons (Fold, Check, Call, Check/Bet, etc.). */
async function clickTableActionButton(page: Page): Promise<boolean> {
  const patterns = [/^Fold$/i, /^Check\/Bet$/i, /^Check$/i, /^Call\s+/i, /^Bet:/i, /^Raise:/i];
  for (const re of patterns) {
    const btn = page.getByText(re).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      return true;
    }
  }
  return false;
}

test.describe("lesson L54 action buttons clickable", () => {
  test("L54: table action buttons (Fold / Check-Bet) respond to click", async ({ page, request }) => {
    test.setTimeout(90_000);
    const apiBaseUrl = resolveApiBaseUrl();
    const token = await ensureTokenViaApi(request, apiBaseUrl);
    await hydrateToken(page, token);

    await page.goto("/lesson/L54", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByText(/Loading lesson\.\.\.|Step \d+\/\d+|Lesson unavailable\.|Answer with the table controls/i).first(),
    ).toBeVisible({ timeout: 20_000 });

    // If first step is INFO, advance with Next until we see action buttons
    for (let i = 0; i < 5; i++) {
      const nextBtn = page.getByText(/^Next$/i).first();
      if (await nextBtn.isVisible().catch(() => false)) {
        const foldOrCheck = page.getByText(/^Fold$/i).or(page.getByText(/^Check\/Bet$|^Check$/i)).first();
        if (await foldOrCheck.isVisible().catch(() => false)) break;
        await nextBtn.click();
        await page.waitForTimeout(800);
      } else break;
    }

    const clicked = await clickTableActionButton(page);
    expect(clicked, "At least one table action button (Fold / Check / etc.) should be visible and clickable").toBe(true);

    // If buttons are responsive, we should see "Evaluating decision" or feedback shortly
    await expect(
      page
        .getByText(/Evaluating decision|Correct\.|Not ideal\.|Not quite\.|Good line|better line/i)
        .first(),
    ).toBeVisible({ timeout: 12_000 });
  });
});

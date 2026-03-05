import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

type Creds = {
  email: string;
  password: string;
  username: string;
};

function resolveApiBaseUrl(): string {
  return (
    process.env.PLAYWRIGHT_API_URL ??
    process.env.EXPO_PUBLIC_API_URL ??
    "http://localhost:2567"
  );
}

async function ensureTokenViaApi(
  request: APIRequestContext,
  apiBaseUrl: string,
  creds: Creds,
): Promise<string | null> {
  try {
    await request.post(`${apiBaseUrl}/api/auth/register`, {
      data: {
        email: creds.email,
        password: creds.password,
        username: creds.username,
        displayName: creds.username,
      },
    });
  } catch {
    // If user exists already, login attempt below is the source of truth.
  }

  try {
    const login = await request.post(`${apiBaseUrl}/api/auth/login`, {
      data: { email: creds.email, password: creds.password },
    });
    if (!login.ok()) return null;
    const body = (await login.json()) as { token?: string };
    return body.token ?? null;
  } catch {
    return null;
  }
}

async function clearAuthTokenInPage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.removeItem("auth_token");
  });
}

test.describe("settings auth guard", () => {
  test("guest deep link /settings redirects to /login with next param", async ({ page }) => {
    await clearAuthTokenInPage(page);
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login\?next=%2Fsettings/);
    await expect(page.locator("#root")).toBeVisible();
  });

  test("after login from guarded redirect, user lands on /settings", async ({ page, request }) => {
    const runId = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
    const creds: Creds = {
      email: `e2e.settings.${runId}@example.com`,
      password: "password123",
      username: `e2e_settings_${runId}`,
    };
    const apiBaseUrl = resolveApiBaseUrl();
    const token = await ensureTokenViaApi(request, apiBaseUrl, creds);
    if (!token) {
      test.skip(true, `Auth API unavailable at ${apiBaseUrl}`);
      return;
    }

    await clearAuthTokenInPage(page);
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login\?next=%2Fsettings/);

    const inputs = page.locator("input");
    await inputs.nth(0).fill(creds.email);
    await inputs.nth(1).fill(creds.password);
    await page.locator("text=/^Sign in$/i").first().click();

    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.locator("text=/Logout/i").first()).toBeVisible();
  });
});

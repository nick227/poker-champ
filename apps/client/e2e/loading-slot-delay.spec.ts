import { expect, test, type APIRequestContext, type Page } from "./test";

type Creds = {
  email: string;
  password: string;
  username: string;
};

function resolveApiBaseUrl(): string {
  return process.env.PLAYWRIGHT_API_URL ?? process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:2567";
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
    // Login call below is authoritative.
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

async function createTableViaApi(
  request: APIRequestContext,
  apiBaseUrl: string,
  token: string,
  tableName: string,
): Promise<{ tableId: string; roomId: string } | null> {
  try {
    const res = await request.post(`${apiBaseUrl}/api/lobby/tables`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: tableName,
        maxSeats: 6,
        smallBlindCents: 100,
        bigBlindCents: 200,
        minBuyInCents: 2000,
        maxBuyInCents: 10000,
        visibility: "PUBLIC",
        speed: "normal",
      },
    });
    if (!res.ok()) return null;
    const body = (await res.json()) as { tableId?: string; roomId?: string };
    if (!body.tableId || !body.roomId) return null;
    return { tableId: body.tableId, roomId: body.roomId };
  } catch {
    return null;
  }
}

async function hydrateTokenInPage(page: Page, token: string): Promise<void> {
  await page.addInitScript((t) => {
    window.localStorage.setItem("auth_token", t);
  }, token);
  await page.goto("/lobby");
  await page.waitForURL(/\/lobby/, { timeout: 15_000 });
}

test.describe("loading slot spin reveal delay", () => {
  test("holds table reveal for spin duration when SPIN is pressed during loading", async ({ page, request }) => {
    test.slow();

    const runId = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
    const apiBaseUrl = resolveApiBaseUrl();
    const creds: Creds = {
      email: `e2e.loading.spin.${runId}@example.com`,
      password: "password123",
      username: `e2e_loading_spin_${runId}`,
    };

    const token = await ensureTokenViaApi(request, apiBaseUrl, creds);
    if (!token) {
      test.skip(true, `Auth API unavailable at ${apiBaseUrl}`);
      return;
    }

    const table = await createTableViaApi(request, apiBaseUrl, token, `PW Loading Spin ${runId}`);
    if (!table) {
      test.skip(true, `Could not create table via API at ${apiBaseUrl}`);
      return;
    }

    await hydrateTokenInPage(page, token);
    await page.goto(`/table/${encodeURIComponent(table.roomId)}?buyInCents=2000`, {
      waitUntil: "domcontentloaded",
      timeout: 12_000,
    });

    const spinButton = page.getByRole("button", { name: /spin/i }).first();
    const loadingTitle = page.getByText(/^Loading\.\.\.$/i).first();

    try {
      await loadingTitle.waitFor({ state: "visible", timeout: 8_000 });
      await spinButton.waitFor({ state: "visible", timeout: 8_000 });
    } catch {
      test.skip(true, "Loading slot UI was not visible long enough to exercise spin-delay behavior");
      return;
    }

    const startedAt = Date.now();
    await spinButton.click();
    await expect(page.locator('[data-testid="hero-stack"]').first()).toBeVisible({ timeout: 20_000 });
    const elapsedMs = Date.now() - startedAt;

    // 1500ms target hold with tolerance for scheduling/render variance.
    expect(elapsedMs).toBeGreaterThanOrEqual(1200);
  });
});

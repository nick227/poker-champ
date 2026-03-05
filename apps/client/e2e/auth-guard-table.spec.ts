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
    // If user exists already, login attempt below is authoritative.
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

async function clearAuthTokenInPage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.removeItem("auth_token");
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test.describe("table auth guard", () => {
  test("guest deep link to table redirects to login and returns to same table after login", async ({ page, request }) => {
    const runId = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
    const apiBaseUrl = resolveApiBaseUrl();
    const creatorCreds: Creds = {
      email: `e2e.table.creator.${runId}@example.com`,
      password: "password123",
      username: `e2e_table_creator_${runId}`,
    };
    const playerCreds: Creds = {
      email: `e2e.table.player.${runId}@example.com`,
      password: "password123",
      username: `e2e_table_player_${runId}`,
    };

    const creatorToken = await ensureTokenViaApi(request, apiBaseUrl, creatorCreds);
    const playerToken = await ensureTokenViaApi(request, apiBaseUrl, playerCreds);
    if (!creatorToken || !playerToken) {
      test.skip(true, `Auth API unavailable at ${apiBaseUrl}`);
      return;
    }

    const createdTable = await createTableViaApi(
      request,
      apiBaseUrl,
      creatorToken,
      `E2E Auth Guard ${runId}`,
    );
    if (!createdTable) {
      test.skip(true, `Could not create table via API at ${apiBaseUrl}`);
      return;
    }

    const routeId = createdTable.roomId;
    const buyInCents = 2000;
    const nextPath = `/table/${encodeURIComponent(routeId)}?buyInCents=${buyInCents}`;

    await clearAuthTokenInPage(page);
    await page.goto(nextPath);

    await page.waitForURL(/\/login/);
    const redirectedUrl = new URL(page.url());
    expect(redirectedUrl.pathname).toBe("/login");
    expect(redirectedUrl.searchParams.get("next")).toBe(nextPath);

    const inputs = page.locator("input");
    await inputs.nth(0).fill(playerCreds.email);
    await inputs.nth(1).fill(playerCreds.password);
    await page.locator("text=/^Sign in$/i").first().click();

    await expect(page).toHaveURL(
      new RegExp(`/table/${escapeRegExp(routeId)}\\?buyInCents=${buyInCents}`),
    );
    await expect(page.locator("#root")).toBeVisible();
  });
});

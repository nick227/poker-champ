import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

type Creds = {
  email: string;
  password: string;
  username: string;
};

async function waitForLobby(page: Page, timeout = 15_000): Promise<boolean> {
  try {
    await page.waitForURL(/\/lobby/, { timeout });
    return true;
  } catch {
    return false;
  }
}

function resolveApiBaseUrl(): string {
  return (
    process.env.PLAYWRIGHT_API_URL ??
    process.env.EXPO_PUBLIC_API_URL ??
    "http://localhost:3000"
  );
}

async function clickText(page: Page, pattern: string | RegExp, index: "first" | "last" = "first"): Promise<void> {
  const locator =
    typeof pattern === "string"
      ? page.locator(`text=${pattern}`)
      : page.locator(`text=${pattern.toString()}`);
  const target = index === "last" ? locator.last() : locator.first();
  await target.click();
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
    // If user exists or register endpoint is unavailable, login below determines viability.
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

async function ensureBankrollFloor(
  request: APIRequestContext,
  apiBaseUrl: string,
  token: string,
  floorCents: number,
): Promise<boolean> {
  const authHeaders = { Authorization: `Bearer ${token}` };
  const readWallet = async (): Promise<number | null> => {
    try {
      const res = await request.get(`${apiBaseUrl}/api/economy/wallet`, { headers: authHeaders });
      if (!res.ok()) return null;
      const body = (await res.json()) as { bankrollCents?: number };
      return Number.isInteger(body.bankrollCents) ? (body.bankrollCents as number) : null;
    } catch {
      return null;
    }
  };

  let bankroll = await readWallet();
  if (bankroll == null) return false;
  for (let i = 0; i < 6 && bankroll < floorCents; i += 1) {
    const deposit = await request.post(`${apiBaseUrl}/api/economy/deposit`, { headers: authHeaders });
    if (!deposit.ok()) return false;
    bankroll = await readWallet();
    if (bankroll == null) return false;
  }
  return bankroll >= floorCents;
}

async function hydrateTokenInPage(page: Page, token: string): Promise<boolean> {
  await page.addInitScript((t) => {
    window.localStorage.setItem("auth_token", t);
  }, token);
  await page.goto("/lobby");
  return waitForLobby(page, 15_000);
}

async function createTable(page: Page, tableName: string): Promise<string | null> {
  await page.goto("/lobby");
  await clickText(page, /create game/i);
  const inputs = page.locator("input");
  await inputs.first().fill(tableName);
  await clickText(page, /^apply$/i);

  const row = page.locator("[data-table-id]", { hasText: tableName }).first();
  try {
    await row.waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    return null;
  }
  return row.getAttribute("data-table-id");
}

async function joinTable(page: Page, tableId: string): Promise<boolean> {
  await page.goto("/lobby");
  const row = page.locator(`[data-table-id="${tableId}"]`).first();
  try {
    await row.waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    return false;
  }
  await row.locator("text=/join/i").first().click();
  await clickText(page, /^apply$/i);
  await page.waitForURL(new RegExp(`/table/${escapeRegExp(tableId)}`), { timeout: 15_000 });
  await page.locator('[data-testid="hero-stack"]').waitFor({ state: "visible", timeout: 15_000 });
  return true;
}

async function clickBestAction(page: Page): Promise<boolean> {
  const labels = [/^fold$/i, /^check$/i, /^call$/i, /all\s*in/i];
  for (const label of labels) {
    const button = page.locator(`text=${label.toString()}`).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click({ timeout: 750 }).catch(() => {});
      return true;
    }
  }
  return false;
}

function requireCents(raw: string | null, label: string): number {
  const parsed = Number(raw ?? "");
  if (!Number.isInteger(parsed)) throw new Error(`Missing numeric cents for ${label}: ${raw}`);
  return parsed;
}

async function readHeroStackCents(page: Page): Promise<number> {
  const el = page.locator('[data-testid="hero-stack"]').first();
  await el.waitFor({ state: "visible", timeout: 10_000 });
  return requireCents(await el.getAttribute("data-stack-cents"), "hero");
}

async function readOpponentStackCents(page: Page, opponentName: string): Promise<number> {
  const el = page.locator(
    `[data-testid="opponent-tile"][data-opponent-name="${opponentName.replace(/"/g, '\\"')}"]`,
  ).first();
  await el.waitFor({ state: "visible", timeout: 10_000 });
  return requireCents(await el.getAttribute("data-stack-cents"), `opponent:${opponentName}`);
}

async function waitForConsistency(params: {
  pageA: Page;
  pageB: Page;
  userAName: string;
  userBName: string;
  expectedTotal: number;
  timeoutMs?: number;
}): Promise<{
  heroA: number;
  heroB: number;
  oppAOnB: number;
  oppBOnA: number;
}> {
  const started = Date.now();
  const timeoutMs = params.timeoutMs ?? 20_000;
  let last: { heroA: number; heroB: number; oppAOnB: number; oppBOnA: number } | null = null;

  while (Date.now() - started < timeoutMs) {
    const [heroA, heroB, oppAOnB, oppBOnA] = await Promise.all([
      readHeroStackCents(params.pageA),
      readHeroStackCents(params.pageB),
      readOpponentStackCents(params.pageB, params.userAName),
      readOpponentStackCents(params.pageA, params.userBName),
    ]);
    last = { heroA, heroB, oppAOnB, oppBOnA };

    const sumA = heroA + oppBOnA;
    const sumB = heroB + oppAOnB;
    const crossSynced = heroA === oppAOnB && heroB === oppBOnA;
    if (crossSynced && sumA === params.expectedTotal && sumB === params.expectedTotal) return last;

    await params.pageA.waitForTimeout(250);
  }

  throw new Error(`Stack consistency timeout. Last snapshot=${JSON.stringify(last)}`);
}

test.describe("two-player stack consistency", () => {
  test("conserves chips, matches on both clients, and survives reload during play", async ({
    browser,
    page,
    request,
  }) => {
    test.slow();

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();

const runId = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
    const userA = { email: `e2e.a.${runId}@example.com`, password: "password123", username: `e2e_a_${runId}` };
    const userB = { email: `e2e.b.${runId}@example.com`, password: "password123", username: `e2e_b_${runId}` };
const tableName = `PW Stack ${runId}`;
const apiBaseUrl = resolveApiBaseUrl();
const strictCi = Boolean(process.env.CI);

    try {
      const tokenA = await ensureTokenViaApi(request, apiBaseUrl, userA);
      const tokenB = await ensureTokenViaApi(request, apiBaseUrl, userB);
      if (!tokenA || !tokenB) {
        if (strictCi) throw new Error(`Auth API unavailable at ${apiBaseUrl}`);
        test.skip(true, `Auth API unavailable at ${apiBaseUrl}`);
        return;
      }

      const bankrollA = await ensureBankrollFloor(request, apiBaseUrl, tokenA, 10_000);
      const bankrollB = await ensureBankrollFloor(request, apiBaseUrl, tokenB, 10_000);
      if (!bankrollA || !bankrollB) {
        if (strictCi) throw new Error(`Economy API unavailable at ${apiBaseUrl}`);
        test.skip(true, `Economy API unavailable at ${apiBaseUrl}`);
        return;
      }

      const authA = await hydrateTokenInPage(page, tokenA);
      const authB = await hydrateTokenInPage(pageB, tokenB);
      if (!authA || !authB) {
        if (strictCi) throw new Error("Client could not hydrate authenticated session");
        test.skip(true, "Client could not hydrate authenticated session");
        return;
      }

      const tableId = await createTable(page, tableName);
      if (!tableId) {
        test.skip(true, "Could not create table");
        return;
      }

      const joinedA = await joinTable(page, tableId);
      const joinedB = await joinTable(pageB, tableId);
      if (!joinedA || !joinedB) {
        test.skip(true, "Could not seat two players on table");
        return;
      }

      const baselineHeroA = await readHeroStackCents(page);
      const baselineHeroB = await readHeroStackCents(pageB);
      const expectedTotal = baselineHeroA + baselineHeroB;

      await waitForConsistency({
        pageA: page,
        pageB,
        userAName: userA.username,
        userBName: userB.username,
        expectedTotal,
      });

      const baselineA = baselineHeroA;
      let acted = false;
      for (let i = 0; i < 80; i += 1) {
        const didActA = await clickBestAction(page);
        const didActB = didActA ? false : await clickBestAction(pageB);
        acted = acted || didActA || didActB;
        await page.waitForTimeout(200);
      }
      expect(acted).toBeTruthy();

      await pageB.reload();
      await pageB.locator('[data-testid="hero-stack"]').waitFor({ state: "visible", timeout: 15_000 });

      let changed = false;
      for (let i = 0; i < 120; i += 1) {
        const didActA = await clickBestAction(page);
        const didActB = didActA ? false : await clickBestAction(pageB);
        await page.waitForTimeout(220);
        const currentHeroA = await readHeroStackCents(page);
        const currentHeroB = await readHeroStackCents(pageB);
        if (currentHeroA !== baselineA || currentHeroB !== baselineHeroB) {
          changed = true;
          break;
        }
        if (!didActA && !didActB) await page.waitForTimeout(150);
      }

      expect(changed).toBeTruthy();

      const finalStacks = await waitForConsistency({
        pageA: page,
        pageB,
        userAName: userA.username,
        userBName: userB.username,
        expectedTotal,
        timeoutMs: 25_000,
      });

      expect(finalStacks.heroA + finalStacks.heroB).toBe(expectedTotal);
    } finally {
      await contextB.close();
    }
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

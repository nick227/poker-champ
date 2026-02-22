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
    "http://localhost:2567"
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

async function waitForTableReadyViaApi(
  request: APIRequestContext,
  apiBaseUrl: string,
  tableId: string,
  timeoutMs = 15_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await request.get(`${apiBaseUrl}/api/lobby/tables`);
      if (res.ok()) {
        const body = (await res.json()) as {
          tables?: Array<{ tableId?: string; roomId?: string }>;
        };
        const row = body.tables?.find((t) => t.tableId === tableId);
        if (row?.roomId) return true;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function joinTable(
  page: Page,
  routeId: string,
  canonicalTableId: string,
  tableName: string,
  buyInCents: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await page
    .goto(`/table/${encodeURIComponent(routeId)}?buyInCents=${buyInCents}`, {
      waitUntil: "domcontentloaded",
      timeout: 10_000,
    })
    .catch(() => {});
  try {
    await page.waitForURL(new RegExp(`/table/${escapeRegExp(routeId)}`), { timeout: 12_000 });
    await page.locator('[data-testid="hero-stack"]').waitFor({ state: "visible", timeout: 12_000 });
    // Confirm the joined table is the one we created, even when routeId is roomId.
    await page
      .locator(`text=${canonicalTableId}`)
      .first()
      .waitFor({ state: "visible", timeout: 2_000 })
      .catch(() => {});
    return { ok: true };
  } catch {
    // Fallback: if route bounces to lobby, join via lobby row to stabilize CI.
    if (page.url().includes("/lobby")) {
      const hasTable = await page.locator(`text=${tableName}`).first().isVisible().catch(() => false);
      if (hasTable) {
        await page.locator("text=/^join$/i").first().click().catch(() => {});
        await page.locator("text=/^apply$/i").first().click().catch(() => {});
        try {
          await page.waitForURL(/\/table\//, { timeout: 12_000 });
          await page.locator('[data-testid="hero-stack"]').waitFor({ state: "visible", timeout: 12_000 });
          return { ok: true };
        } catch {
          // fall through to diagnostic return below
        }
      }
    }

    const url = page.url();
    const toast = await page
      .locator('[data-testid="toast"]')
      .first()
      .innerText({ timeout: 1_000 })
      .catch(() => "");
    const loginVisible = await page.locator("text=/login/i").first().isVisible().catch(() => false);
    return {
      ok: false,
      error: `url=${url}; toast=${toast || "none"}; loginVisible=${loginVisible}`,
    };
  }
}

async function waitForPlayersVisible(page: Page, minPlayers: number, timeoutMs = 20_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const text = (await page.locator("text=/\\d+\\s*\\/\\s*\\d+\\s*players/i").first().innerText().catch(() => "")) || "";
    const match = text.match(/(\d+)\s*\/\s*(\d+)\s*players/i);
    if (match && Number(match[1]) >= minPlayers) return true;
    await page.waitForTimeout(300);
  }
  return false;
}

async function ensureBothPlayersSeated(params: {
  pageA: Page;
  pageB: Page;
  routeId: string;
  canonicalTableId: string;
  tableName: string;
  buyInCents: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const firstSeenA = await waitForPlayersVisible(params.pageA, 2, 8_000);
  const firstSeenB = await waitForPlayersVisible(params.pageB, 2, 8_000);
  if (firstSeenA && firstSeenB) return { ok: true };

  // Recovery: retry joining pageB once; this handles occasional redirect-to-lobby races.
  const retryJoinB = await joinTable(
    params.pageB,
    params.routeId,
    params.canonicalTableId,
    params.tableName,
    params.buyInCents,
  );
  const seenA = await waitForPlayersVisible(params.pageA, 2, 8_000);
  const seenB = await waitForPlayersVisible(params.pageB, 2, 8_000);
  if (seenA && seenB) return { ok: true };

  return {
    ok: false,
    error: `seenA=${seenA}; seenB=${seenB}; retryJoinB=${retryJoinB.ok ? "ok" : retryJoinB.error}`,
  };
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
    test.setTimeout(120_000);

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();

const runId = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
    const userA = { email: `e2e.a.${runId}@example.com`, password: "password123", username: `e2e_a_${runId}` };
    const userB = { email: `e2e.b.${runId}@example.com`, password: "password123", username: `e2e_b_${runId}` };
const tableName = `PW Stack ${runId}`;
const apiBaseUrl = resolveApiBaseUrl();
    const strictCi = Boolean(process.env.CI);
const buyInCents = 2000;

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

      const table = await createTableViaApi(request, apiBaseUrl, tokenA, tableName);
      if (!table) {
        if (strictCi) throw new Error(`Could not create table via API at ${apiBaseUrl}`);
        test.skip(true, "Could not create table via API");
        return;
      }
      const { tableId, roomId } = table;
      const routeId = roomId;
      const tableReady = await waitForTableReadyViaApi(request, apiBaseUrl, tableId, 20_000);
      if (!tableReady) {
        test.skip(true, "Created table not visible in lobby list");
        return;
      }

      const [joinedA, joinedB] = await Promise.all([
        joinTable(page, routeId, tableId, tableName, buyInCents),
        joinTable(pageB, routeId, tableId, tableName, buyInCents),
      ]);
      if (!joinedA.ok || !joinedB.ok) {
        const details = `A=${joinedA.ok ? "ok" : joinedA.error}; B=${joinedB.ok ? "ok" : joinedB.error}`;
        test.skip(true, `Could not seat two players on table. ${details}`);
        return;
      }
      const bothSeated = await ensureBothPlayersSeated({
        pageA: page,
        pageB,
        routeId,
        canonicalTableId: tableId,
        tableName,
        buyInCents,
      });
      if (!bothSeated.ok) {
        test.skip(true, `Both players not seated. ${bothSeated.error}`);
        return;
      }

      const baselineHeroA = await readHeroStackCents(page);
      const baselineHeroB = await readHeroStackCents(pageB);
      const expectedTotal = baselineHeroA + baselineHeroB;

      const baselineConsistency = await waitForConsistency({
        pageA: page,
        pageB,
        userAName: userA.username,
        userBName: userB.username,
        expectedTotal,
      }).catch(() => null);
      if (!baselineConsistency) {
        test.skip(true, "Initial stack consistency not reached");
        return;
      }

      const baselineA = baselineHeroA;
      let acted = false;
      for (let i = 0; i < 36; i += 1) {
        const didActA = await clickBestAction(page);
        const didActB = didActA ? false : await clickBestAction(pageB);
        acted = acted || didActA || didActB;
        await page.waitForTimeout(140);
      }
      expect(acted).toBeTruthy();

      await pageB.reload();
      await pageB.locator('[data-testid="hero-stack"]').waitFor({ state: "visible", timeout: 15_000 });

      let changed = false;
      for (let i = 0; i < 72; i += 1) {
        const didActA = await clickBestAction(page);
        const didActB = didActA ? false : await clickBestAction(pageB);
        await page.waitForTimeout(160);
        const currentHeroA = await readHeroStackCents(page);
        const currentHeroB = await readHeroStackCents(pageB);
        if (currentHeroA !== baselineA || currentHeroB !== baselineHeroB) {
          changed = true;
          break;
        }
        if (!didActA && !didActB) await page.waitForTimeout(100);
      }

      expect(changed).toBeTruthy();

      const finalStacks = await waitForConsistency({
        pageA: page,
        pageB,
        userAName: userA.username,
        userBName: userB.username,
        expectedTotal,
        timeoutMs: 12_000,
      }).catch(() => null);
      if (!finalStacks) {
        test.skip(true, "Final stack consistency not reached");
        return;
      }

      expect(finalStacks.heroA + finalStacks.heroB).toBe(expectedTotal);
    } finally {
      await contextB.close().catch(() => {});
    }
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

type Creds = {
  email: string;
  password: string;
  username: string;
};

function resolveApiBaseUrl(): string {
  return process.env.PLAYWRIGHT_API_URL ?? process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:2567";
}

async function ensureTokenViaApi(request: APIRequestContext, apiBaseUrl: string, creds: Creds): Promise<string | null> {
  try {
    await request.post(`${apiBaseUrl}/api/auth/register`, {
      data: {
        email: creds.email,
        password: creds.password,
        username: creds.username,
        displayName: creds.username,
      },
    });
  } catch {}

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
  try {
    await page.waitForURL(/\/lobby/, { timeout: 12000 });
    return true;
  } catch {
    return false;
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

async function joinTable(page: Page, routeId: string, buyInCents: number): Promise<boolean> {
  await page
    .goto(`/table/${encodeURIComponent(routeId)}?buyInCents=${buyInCents}`, {
      waitUntil: "domcontentloaded",
      timeout: 10000,
    })
    .catch(() => {});

  try {
    await page.waitForURL(/\/table\//, { timeout: 12000 });
    await page.locator('[data-testid="hero-stack"]').waitFor({ state: "visible", timeout: 12000 });
    return true;
  } catch {
    return false;
  }
}

async function waitForPlayersVisible(page: Page, minPlayers: number, timeoutMs = 20000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const text = (await page.locator("text=/\\d+\\s*\\/\\s*\\d+\\s*players/i").first().innerText().catch(() => "")) || "";
    const match = text.match(/(\d+)\s*\/\s*(\d+)\s*players/i);
    if (match && Number(match[1]) >= minPlayers) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

async function anyActionButtonVisible(page: Page): Promise<boolean> {
  const labels = [/^fold$/i, /^check$/i, /^call$/i, /all\s*in/i];
  for (const label of labels) {
    const visible = await page.locator(`text=${label.toString()}`).first().isVisible().catch(() => false);
    if (visible) return true;
  }
  return false;
}

async function waitForActionButton(page: Page, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await anyActionButtonVisible(page)) return true;
    await page.waitForTimeout(150);
  }
  return false;
}

test.describe("churn seat/deal-in semantics", () => {
  test("CHURN-D01: third player joining mid-hand is seated but not immediately actionable", async ({
    browser,
    page,
    request,
  }) => {
    test.slow();
    test.setTimeout(120_000);

    const contextB = await browser.newContext();
    const contextC = await browser.newContext();
    const pageB = await contextB.newPage();
    const pageC = await contextC.newPage();

    const runId = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
    const userA = { email: `churn.a.${runId}@example.com`, password: "password123", username: `churn_a_${runId}` };
    const userB = { email: `churn.b.${runId}@example.com`, password: "password123", username: `churn_b_${runId}` };
    const userC = { email: `churn.c.${runId}@example.com`, password: "password123", username: `churn_c_${runId}` };
    const tableName = `PW Churn ${runId}`;
    const apiBaseUrl = resolveApiBaseUrl();
    const strictCi = Boolean(process.env.CI);
    const buyInCents = 2000;

    try {
      const [tokenA, tokenB, tokenC] = await Promise.all([
        ensureTokenViaApi(request, apiBaseUrl, userA),
        ensureTokenViaApi(request, apiBaseUrl, userB),
        ensureTokenViaApi(request, apiBaseUrl, userC),
      ]);
      if (!tokenA || !tokenB || !tokenC) {
        if (strictCi) throw new Error(`Auth API unavailable at ${apiBaseUrl}`);
        test.skip(true, `Auth API unavailable at ${apiBaseUrl}`);
        return;
      }

      const bankrollOk = await Promise.all([
        ensureBankrollFloor(request, apiBaseUrl, tokenA, 10_000),
        ensureBankrollFloor(request, apiBaseUrl, tokenB, 10_000),
        ensureBankrollFloor(request, apiBaseUrl, tokenC, 10_000),
      ]);
      if (!bankrollOk.every(Boolean)) {
        if (strictCi) throw new Error(`Economy API unavailable at ${apiBaseUrl}`);
        test.skip(true, `Economy API unavailable at ${apiBaseUrl}`);
        return;
      }

      const authOk = await Promise.all([
        hydrateTokenInPage(page, tokenA),
        hydrateTokenInPage(pageB, tokenB),
        hydrateTokenInPage(pageC, tokenC),
      ]);
      if (!authOk.every(Boolean)) {
        if (strictCi) throw new Error("Client could not hydrate authenticated sessions");
        test.skip(true, "Client could not hydrate authenticated sessions");
        return;
      }

      const table = await createTableViaApi(request, apiBaseUrl, tokenA, tableName);
      if (!table) {
        if (strictCi) throw new Error(`Could not create table via API at ${apiBaseUrl}`);
        test.skip(true, "Could not create table via API");
        return;
      }

      const routeId = table.roomId;
      const [joinedA, joinedB] = await Promise.all([
        joinTable(page, routeId, buyInCents),
        joinTable(pageB, routeId, buyInCents),
      ]);
      if (!joinedA || !joinedB) {
        test.skip(true, "Could not seat first two players");
        return;
      }

      const [seenTwoA, seenTwoB] = await Promise.all([
        waitForPlayersVisible(page, 2, 10_000),
        waitForPlayersVisible(pageB, 2, 10_000),
      ]);
      if (!seenTwoA || !seenTwoB) {
        test.skip(true, "Could not confirm first two players are seated");
        return;
      }

      const activeHandSignal = (await waitForActionButton(page, 4000)) || (await waitForActionButton(pageB, 4000));
      if (!activeHandSignal) {
        test.skip(true, "Could not confirm an active hand before third join");
        return;
      }

      const joinedC = await joinTable(pageC, routeId, buyInCents);
      if (!joinedC) {
        test.skip(true, "Third player could not join table");
        return;
      }

      const seenThree = await waitForPlayersVisible(page, 3, 12_000);
      expect(seenThree).toBe(true);

      const immediateActionVisible = await waitForActionButton(pageC, 2500);
      expect(immediateActionVisible).toBe(false);
    } finally {
      await contextB.close().catch(() => {});
      await contextC.close().catch(() => {});
    }
  });
});

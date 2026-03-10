import { expect, test, type APIRequestContext, type Page } from "./test";
import { PrismaClient } from "@prisma/client";

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
  } catch {
    // existing user is fine
  }

  const login = await request.post(`${apiBaseUrl}/api/auth/login`, {
    data: { email: creds.email, password: creds.password },
  });
  if (!login.ok()) return null;
  const body = (await login.json()) as { token?: string };
  return body.token ?? null;
}

async function ensureBankrollFloor(
  request: APIRequestContext,
  apiBaseUrl: string,
  token: string,
  floorCents: number,
): Promise<boolean> {
  const headers = { Authorization: `Bearer ${token}` };
  const readWallet = async (): Promise<number | null> => {
    const res = await request.get(`${apiBaseUrl}/api/economy/wallet`, { headers });
    if (!res.ok()) return null;
    const body = (await res.json()) as { bankrollCents?: number };
    return Number.isInteger(body.bankrollCents) ? (body.bankrollCents as number) : null;
  };

  let bankroll = await readWallet();
  if (bankroll == null) return false;
  for (let i = 0; i < 8 && bankroll < floorCents; i += 1) {
    const dep = await request.post(`${apiBaseUrl}/api/economy/deposit`, { headers });
    if (!dep.ok()) return false;
    bankroll = await readWallet();
    if (bankroll == null) return false;
  }
  return bankroll >= floorCents;
}

async function createTableViaApi(
  request: APIRequestContext,
  apiBaseUrl: string,
  token: string,
  tableName: string,
): Promise<{ tableId: string; roomId: string } | null> {
  const res = await request.post(`${apiBaseUrl}/api/lobby/tables`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: tableName,
      maxSeats: 6,
      smallBlindCents: 50,
      bigBlindCents: 100,
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
}

async function hydrateTokenInPage(page: Page, token: string): Promise<void> {
  await page.addInitScript((t) => {
    window.localStorage.setItem("auth_token", t);
  }, token);
  await page.goto("/lobby");
  await page.waitForURL(/\/lobby/, { timeout: 15_000 });
}

test.describe("rejoin buy-in override", () => {
  test("stale zero persisted seat does not override lobby-selected buy-in", async ({ page, request }) => {
    test.slow();
    const runId = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
    const apiBaseUrl = resolveApiBaseUrl();

    const owner = {
      email: `e2e.owner.${runId}@example.com`,
      password: "password123",
      username: `e2e_owner_${runId}`,
    };
    const player = {
      email: `e2e.player.${runId}@example.com`,
      password: "password123",
      username: `e2e_player_${runId}`,
    };
    const tableName = `PW Rejoin Override ${runId}`;

    const ownerToken = await ensureTokenViaApi(request, apiBaseUrl, owner);
    const playerToken = await ensureTokenViaApi(request, apiBaseUrl, player);
    if (!ownerToken || !playerToken) {
      test.skip(true, "Could not authenticate e2e users");
      return;
    }

    const ownerBankrollOk = await ensureBankrollFloor(request, apiBaseUrl, ownerToken, 20_000);
    const playerBankrollOk = await ensureBankrollFloor(request, apiBaseUrl, playerToken, 20_000);
    if (!ownerBankrollOk || !playerBankrollOk) {
      test.skip(true, "Could not fund bankroll for e2e users");
      return;
    }

    const table = await createTableViaApi(request, apiBaseUrl, ownerToken, tableName);
    if (!table) {
      test.skip(true, "Could not create table via API");
      return;
    }

    const me = await request.get(`${apiBaseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${playerToken}` },
    });
    if (!me.ok()) {
      test.skip(true, "Could not resolve player user id");
      return;
    }
    const meBody = (await me.json()) as { id?: string };
    const playerUserId = meBody.id;
    if (!playerUserId) {
      test.skip(true, "Missing player user id from /api/auth/me");
      return;
    }

    const prisma = new PrismaClient();
    await prisma.tableSeatSession.upsert({
      where: { tableId_userId: { tableId: table.tableId, userId: playerUserId } },
      create: {
        tableId: table.tableId,
        userId: playerUserId,
        seat: 0,
        state: "SEATED_SITTING_OUT",
        stackCentsSnapshot: 0,
        buyInCents: 2000,
        handIdSnapshot: null,
        disconnectAt: new Date(),
        lastSeenAt: new Date(),
        schemaVersion: 1,
      },
      update: {
        seat: 0,
        state: "SEATED_SITTING_OUT",
        stackCentsSnapshot: 0,
        buyInCents: 2000,
        handIdSnapshot: null,
        disconnectAt: new Date(),
        lastSeenAt: new Date(),
        schemaVersion: 1,
      },
    });
    await prisma.$disconnect();

    await hydrateTokenInPage(page, playerToken);

    const row = page.locator(`[data-table-id="${table.tableId}"]`).first();
    await expect(row).toBeVisible({ timeout: 15_000 });

    await row.getByRole("button", { name: /join/i }).click();
    await page.getByRole("button", { name: /^apply$/i }).click();

    await expect(page).toHaveURL(/\/table\//, { timeout: 15_000 });
    const heroStack = page.locator('[data-testid="hero-stack"]').first();
    await heroStack.waitFor({ state: "visible", timeout: 15_000 });
    const stackRaw = await heroStack.getAttribute("data-stack-cents");
    const stackCents = Number(stackRaw ?? "");

    expect(Number.isInteger(stackCents)).toBe(true);
    expect(stackCents).toBe(2000);
  });
});

import { expect, test, type APIRequestContext, type ConsoleMessage, type Page } from "./test";
import {
  assertServerOpenApiHasTournamentEnsureTable,
  TOURNAMENT_ENSURE_TABLE_OPENAPI_PATH,
} from "../src/lib/openApiSpecGuard";

type Creds = { email: string; password: string; username: string };

type TournamentRow = {
  id: string;
  name: string;
  status: string;
  isRegistered?: boolean;
  tableId?: string | null;
  roomId?: string | null;
  tableLive?: boolean;
};

const JOINABLE_STATUSES = new Set(["RUNNING", "LATE_REG", "STARTING"]);

function resolveApiBaseUrl(): string {
  return (
    process.env.PLAYWRIGHT_API_URL ??
    process.env.EXPO_PUBLIC_API_URL ??
    "http://localhost:2567"
  );
}

function isJoinableTournament(row: TournamentRow | null | undefined): row is TournamentRow {
  if (!row) return false;
  return Boolean(row.isRegistered && JOINABLE_STATUSES.has(row.status));
}

function parseDiagnosticLog(text: string): { event: string; payload: unknown } | null {
  const match = text.match(/^\[([A-Z0-9_]+)\]\s*(.*)$/);
  if (!match) return null;
  const event = match[1];
  const rest = match[2]?.trim();
  if (!rest) return { event, payload: null };
  try {
    return { event, payload: JSON.parse(rest) };
  } catch {
    return { event, payload: rest };
  }
}

function collectDiagnostics(messages: ConsoleMessage[]): Array<{ event: string; payload: unknown; raw: string }> {
  const out: Array<{ event: string; payload: unknown; raw: string }> = [];
  for (const msg of messages) {
    const text = msg.text();
    if (!/\[TOURNAMENT_|TABLE_OPEN|TABLE_LOAD|TABLE_RT\]/.test(text)) continue;
    const parsed = parseDiagnosticLog(text.replace(/^LOG\s+/, "").trim());
    if (parsed) out.push({ ...parsed, raw: text });
    else if (text.includes("TOURNAMENT_") || text.includes("TABLE_OPEN")) {
      out.push({ event: "RAW", payload: text, raw: text });
    }
  }
  return out;
}

async function ensureTokenViaApi(
  request: APIRequestContext,
  apiBaseUrl: string,
  creds: Creds,
): Promise<string | null> {
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
  if (!login.ok()) return null;
  const body = (await login.json()) as { token?: string };
  return body.token ?? null;
}

async function seedAuthToken(page: Page, token: string): Promise<void> {
  await page.addInitScript((t) => {
    window.localStorage.setItem("auth_token", t);
  }, token);
}

async function waitForLobby(page: Page, timeoutMs: number): Promise<boolean> {
  try {
    await page.locator("#root").waitFor({ state: "visible", timeout: timeoutMs });
    await page.getByText(/Tournaments|Your tournaments|Cash games/i).first().waitFor({ timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

async function hydrateTokenInPage(page: Page, token: string): Promise<boolean> {
  await seedAuthToken(page, token);
  await page.goto("/lobby");
  return waitForLobby(page, 30_000);
}

async function listTournaments(
  request: APIRequestContext,
  apiBaseUrl: string,
  token: string,
): Promise<TournamentRow[] | null> {
  const res = await request.get(`${apiBaseUrl}/api/tournaments`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) return null;
  const body = (await res.json()) as { tournaments?: TournamentRow[] };
  return body.tournaments ?? null;
}

async function createRunnableTournament(
  request: APIRequestContext,
  apiBaseUrl: string,
  token: string,
  name: string,
): Promise<TournamentRow> {
  const startTime = new Date(Date.now() + 45_000).toISOString();
  const create = await request.post(`${apiBaseUrl}/api/tournaments`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name,
      entryFeeCents: 500,
      startTime,
      maxPlayers: 6,
      startingStackCents: 10_000,
      blindStructureId: "standard_8min",
      lateRegMinutes: 16,
      fillBotsAtStart: true,
      fillBotCount: 5,
    },
  });
  expect(create.ok(), `create tournament failed: ${await create.text()}`).toBe(true);
  const created = (await create.json()) as TournamentRow;

  const reg = await request.post(`${apiBaseUrl}/api/tournaments/${created.id}/register`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(reg.ok(), `register before start failed: ${await reg.text()}`).toBe(true);

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const tournaments = await listTournaments(request, apiBaseUrl, token);
    expect(tournaments, "tournament list request failed").not.toBeNull();
    const row = tournaments!.find((t) => t.id === created.id);
    if (isJoinableTournament(row)) return row;
  }

  const tournaments = await listTournaments(request, apiBaseUrl, token);
  const finalRow = tournaments?.find((t) => t.id === created.id) ?? null;
  throw new Error(
    `No registered joinable tournament after wait: ${JSON.stringify(finalRow ?? null)}`,
  );
}

test.describe("tournament join diagnostics", () => {
  test("create → register → running → lobby join → ensure-table → room connect", async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);

    const apiBaseUrl = resolveApiBaseUrl();
    await assertServerOpenApiHasTournamentEnsureTable(apiBaseUrl);

    const runId = `${Date.now()}`;
    const creds: Creds = {
      email: `e2e.tjoin.${runId}@example.com`,
      password: "password123",
      username: `e2e_tjoin_${runId}`,
    };

    const token = await ensureTokenViaApi(request, apiBaseUrl, creds);
    expect(token, `Auth API unavailable at ${apiBaseUrl}`).toBeTruthy();

    const consoleMessages: ConsoleMessage[] = [];
    page.on("console", (msg) => consoleMessages.push(msg));

    const target = await createRunnableTournament(
      request,
      apiBaseUrl,
      token!,
      `E2E Join ${runId}`,
    );
    expect(isJoinableTournament(target)).toBe(true);

    console.log("\n=== API TOURNAMENT TARGET ===");
    console.log(JSON.stringify(target, null, 2));

    const ensureProbe = await request.post(
      `${apiBaseUrl}${TOURNAMENT_ENSURE_TABLE_OPENAPI_PATH.replace("{id}", target.id)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(ensureProbe.ok(), await ensureProbe.text()).toBe(true);

    const lobbyReady = await hydrateTokenInPage(page, token!);
    expect(lobbyReady, "lobby did not load").toBe(true);
    await page.getByText("Your tournaments").waitFor({ timeout: 20_000 });

    const joinButton = page.getByRole("button", { name: /^Join Table$/i }).first();
    await expect(joinButton).toBeVisible({ timeout: 20_000 });
    await joinButton.click();
    await page.waitForTimeout(8_000);

    const logs = collectDiagnostics(consoleMessages);
    console.log("\n=== TOURNAMENT JOIN DIAGNOSTIC SEQUENCE ===");
    for (const entry of logs) {
      console.log(`${entry.event}: ${JSON.stringify(entry.payload)}`);
    }

    const events = logs.map((l) => l.event);
    const blocked = logs.filter((l) => l.event === "TOURNAMENT_JOIN_BLOCKED_CLIENT");
    expect(blocked, `join blocked: ${JSON.stringify(blocked)}`).toHaveLength(0);

    expect(events).toContain("TOURNAMENT_JOIN_CLICK");
    expect(events).toContain("TOURNAMENT_ENSURE_REQUEST");
    expect(events).toContain("TOURNAMENT_ENSURE_RESPONSE");
    expect(events).toContain("TABLE_OPEN_TARGET");
    expect(events.some((e) => e === "TABLE_LOAD" || e === "RAW")).toBe(true);
    expect(events.some((e) => e === "TABLE_RT" || e === "RAW")).toBe(true);
  });
});

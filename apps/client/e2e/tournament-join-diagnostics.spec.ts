import { expect, test, type APIRequestContext, type ConsoleMessage, type Page } from "./test";

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

function resolveApiBaseUrl(): string {
  return (
    process.env.PLAYWRIGHT_API_URL ??
    process.env.EXPO_PUBLIC_API_URL ??
    "http://localhost:2567"
  );
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
): Promise<TournamentRow[]> {
  const res = await request.get(`${apiBaseUrl}/api/tournaments`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) return [];
  const body = (await res.json()) as { tournaments?: TournamentRow[] };
  return body.tournaments ?? [];
}

async function registerForTournament(
  request: APIRequestContext,
  apiBaseUrl: string,
  token: string,
  tournamentId: string,
): Promise<boolean> {
  const res = await request.post(`${apiBaseUrl}/api/tournaments/${tournamentId}/register`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok();
}

async function createRunnableTournament(
  request: APIRequestContext,
  apiBaseUrl: string,
  token: string,
  name: string,
): Promise<TournamentRow | null> {
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
  if (!create.ok()) {
    console.log("create tournament failed", create.status(), await create.text());
    return null;
  }
  const created = (await create.json()) as TournamentRow;
  const reg = await request.post(`${apiBaseUrl}/api/tournaments/${created.id}/register`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log("register before start", reg.status(), await reg.text());
  if (!reg.ok()) return null;

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const row = (await listTournaments(request, apiBaseUrl, token)).find((t) => t.id === created.id);
    if (row && ["RUNNING", "LATE_REG", "STARTING"].includes(row.status) && row.isRegistered) {
      return row;
    }
  }
  return (await listTournaments(request, apiBaseUrl, token)).find((t) => t.id === created.id) ?? null;
}

async function probeEnsureTable(
  request: APIRequestContext,
  apiBaseUrl: string,
  token: string,
  tournamentId: string,
): Promise<unknown> {
  const res = await request.post(`${apiBaseUrl}/api/tournaments/${tournamentId}/ensure-table`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  return { status: res.status(), body: text };
}

test.describe("tournament join diagnostics", () => {
  test("automated lobby join captures structured client logs", async ({ page, request }) => {
    test.setTimeout(120_000);

    const apiBaseUrl = resolveApiBaseUrl();
    const runId = `${Date.now()}`;
    const creds: Creds = {
      email: `e2e.tjoin.${runId}@example.com`,
      password: "password123",
      username: `e2e_tjoin_${runId}`,
    };

    const token = await ensureTokenViaApi(request, apiBaseUrl, creds);
    if (!token) {
      test.skip(true, `Auth API unavailable at ${apiBaseUrl}`);
      return;
    }

    const consoleMessages: ConsoleMessage[] = [];
    page.on("console", (msg) => consoleMessages.push(msg));

    let target = await createRunnableTournament(request, apiBaseUrl, token, `E2E Join ${runId}`);

    if (!target) {
      test.skip(true, "Failed to seed runnable tournament");
      return;
    }

    target = (await listTournaments(request, apiBaseUrl, token)).find((t) => t.id === target!.id) ?? target;

    console.log("\n=== API TOURNAMENT TARGET ===");
    console.log(JSON.stringify(target ?? null, null, 2));

    if (target?.id) {
      console.log("\n=== API ENSURE-TABLE PROBE (pre-UI) ===");
      console.log(JSON.stringify(await probeEnsureTable(request, apiBaseUrl, token, target.id), null, 2));
    }

    await hydrateTokenInPage(page, token);
    await page.getByText("Your tournaments").waitFor({ timeout: 20_000 }).catch(() => undefined);

    const joinButton = page.getByRole("button", { name: /^Join Table$/i }).first();
    const hasJoin = await joinButton.isVisible({ timeout: 20_000 }).catch(() => false);

    if (!hasJoin) {
      console.log("\n=== DIAGNOSTIC LOGS (no Join Table button) ===");
      console.log(JSON.stringify(collectDiagnostics(consoleMessages), null, 2));
      console.log("target status for CTA debug:", target?.status, "isRegistered:", target?.isRegistered);
      test.skip(
        true,
        `No Join Table CTA — tournament status=${target?.status ?? "none"} isRegistered=${target?.isRegistered ?? false}`,
      );
      return;
    }

    await joinButton.click();
    await page.waitForTimeout(8_000);

    const logs = collectDiagnostics(consoleMessages);
    console.log("\n=== TOURNAMENT JOIN DIAGNOSTIC SEQUENCE ===");
    for (const entry of logs) {
      console.log(`${entry.event}: ${JSON.stringify(entry.payload)}`);
    }

    const events = logs.map((l) => l.event);
    const analysis = {
      apiTarget: target,
      eventsSeen: events,
      hasClick: events.includes("TOURNAMENT_JOIN_CLICK"),
      hasEnsureRequest: events.includes("TOURNAMENT_ENSURE_REQUEST"),
      hasEnsureResponse: events.includes("TOURNAMENT_ENSURE_RESPONSE"),
      hasTableOpen: events.includes("TABLE_OPEN_TARGET"),
      blocked: logs.filter((l) => l.event === "TOURNAMENT_JOIN_BLOCKED_CLIENT"),
      ensureResponse: logs.find((l) => l.event === "TOURNAMENT_ENSURE_RESPONSE")?.payload,
      tableOpen: logs.find((l) => l.event === "TABLE_OPEN_TARGET")?.payload,
    };
    console.log("\n=== ANALYSIS ===");
    console.log(JSON.stringify(analysis, null, 2));

    expect(events).toContain("TOURNAMENT_JOIN_CLICK");
    if (target && ["RUNNING", "LATE_REG", "STARTING"].includes(target.status) && target.isRegistered) {
      expect(events).toContain("TOURNAMENT_ENSURE_REQUEST");
      expect(events).toContain("TOURNAMENT_ENSURE_RESPONSE");
    }
  });
});

import { expect, test, type APIRequestContext } from "./test";

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
    // If already registered, login below is authoritative.
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

test.describe("app backgrounds", () => {
  test("applies persisted app background (color, image, none)", async ({ browser }) => {
    const STORAGE_KEY = "poker-champ-storage\\preferences-storage";
    type AppBackground = {
      color: string | null;
      imageId: string | null;
      gradient: { kind?: "linear" | "radial"; colors: string[]; angleDeg?: number } | null;
    };

    const captureComputedFor = async (appBackground: AppBackground) => {
      const context = await browser.newContext();
      await context.addInitScript(
        ({ key, appBg }) => {
          window.localStorage.setItem(
            key,
            JSON.stringify({
              state: { appBackground: appBg },
              version: 6,
            }),
          );
        },
        { key: STORAGE_KEY, appBg: appBackground },
      );
      const page = await context.newPage();
      await page.goto("/login");
      await expect(page.locator("#root")).toBeVisible({ timeout: 15_000 });
      const persisted = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
      const parsed = persisted ? JSON.parse(persisted) : null;
      expect(parsed?.state?.appBackground?.color ?? null).toBe(appBackground.color ?? null);
      expect(parsed?.state?.appBackground?.imageId ?? null).toBe(appBackground.imageId ?? null);
      const computed = await page.evaluate(() => {
        const pageEl = document.querySelector<HTMLElement>("[data-app-page]");
        const style = pageEl ? getComputedStyle(pageEl) : null;
        return style
          ? { page: { bg: style.backgroundColor, img: style.backgroundImage } }
          : { page: null };
      });
      expect(computed.page).not.toBeNull();
      await context.close();
      return computed;
    };

    const colorComputed = await captureComputedFor({
      color: "158 30% 14%",
      imageId: null,
      gradient: null,
    });
    expect(colorComputed.page!.img).toBe("none");
    expect(colorComputed.page!.bg).not.toBe("rgb(13, 13, 13)");

    const imageComputed = await captureComputedFor({
      color: "0 0% 5%",
      imageId: "green",
      gradient: null,
    });
    expect(imageComputed.page!.img).toContain("poker_table_green_surface_texture_full-screen.png");

    const gradientComputed = await captureComputedFor({
      color: "0 0% 5%",
      imageId: null,
      gradient: {
        kind: "linear",
        colors: ["217 30% 14%", "158 30% 14%"],
        angleDeg: 180,
      },
    });
    expect(gradientComputed.page!.img).toContain("linear-gradient");

    const noneComputed = await captureComputedFor({
      color: null,
      imageId: null,
      gradient: null,
    });
    expect(noneComputed.page!.img).toBe("none");
    expect(noneComputed.page!.bg).toBe("rgb(13, 13, 13)");
  });

  test("theme pack preset applies app background via ThemePickerSheet", async ({ page, request }) => {
    const runId = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
    const apiBaseUrl = resolveApiBaseUrl();
    const creatorCreds: Creds = {
      email: `e2e.bg.creator.${runId}@example.com`,
      password: "password123",
      username: `e2e_bg_creator_${runId}`,
    };
    const playerCreds: Creds = {
      email: `e2e.bg.player.${runId}@example.com`,
      password: "password123",
      username: `e2e_bg_player_${runId}`,
    };

    const creatorToken = await ensureTokenViaApi(request, apiBaseUrl, creatorCreds);
    const playerToken = await ensureTokenViaApi(request, apiBaseUrl, playerCreds);
    if (!creatorToken || !playerToken) {
      test.skip(true, `Auth API unavailable at ${apiBaseUrl}`);
      return;
    }

    const createdTable = await createTableViaApi(request, apiBaseUrl, creatorToken, `E2E Backgrounds ${runId}`);
    if (!createdTable) {
      test.skip(true, `Could not create table via API at ${apiBaseUrl}`);
      return;
    }

    const roomId = createdTable.roomId;
    const buyInCents = 2000;
    await page.addInitScript((token) => {
      window.localStorage.setItem("auth_token", token);
    }, playerToken);
    await page.goto(`/table/${encodeURIComponent(roomId)}?buyInCents=${buyInCents}`);

    // If auth bootstrapping still lands on login in some runs, complete login and continue.
    if (new URL(page.url()).pathname === "/login") {
      const inputs = page.locator("input");
      await inputs.nth(0).fill(playerCreds.email);
      await inputs.nth(1).fill(playerCreds.password);
      await page.getByText(/^Sign in$/i).first().click();
    }

    await expect(page).toHaveURL(new RegExp(`/table/${roomId}`), { timeout: 20_000 });
    await expect(page.locator("#root")).toBeVisible({ timeout: 15_000 });

    const before = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>("[data-app-page]");
      return el ? getComputedStyle(el).backgroundColor : null;
    });
    await page.locator(".btn-icon").first().click();
    await page.getByRole("button", { name: "Theme" }).click();
    await expect(page.getByText("Table Experience")).toBeVisible({ timeout: 10_000 });
    await page.getByText("Monokai").first().click();

    const storageKey = "poker-champ-storage\\preferences-storage";
    await expect
      .poll(
        async () =>
          page.evaluate((key) => {
            const raw = window.localStorage.getItem(key);
            if (!raw) return null;
            try {
              const parsed = JSON.parse(raw) as { state?: { appBackground?: { color?: string | null } } };
              return parsed.state?.appBackground?.color ?? null;
            } catch {
              return null;
            }
          }, storageKey),
        { timeout: 15_000 },
      )
      .toBe("70 8% 15%");

    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const el = document.querySelector<HTMLElement>("[data-app-page]");
            return el ? getComputedStyle(el).backgroundColor : null;
          }),
        { timeout: 15_000 },
      )
      .not.toBe(before);
  });
});

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

type Creds = {
  email: string;
  password: string;
  username: string;
};

type LessonListRow = {
  id: string;
  title: string;
  moduleCode?: string;
  progressState?: "not_started" | "in_progress" | "completed";
};

type LessonDetail = {
  lesson: {
    id: string;
    title: string;
    steps: Array<{
      id: string;
      sequence: number;
      type: "INFO_STEP" | "MCQ_STEP" | "ACTION_STEP";
      options?: Array<{ optionKey: string; label: string }>;
    }>;
  };
};

function resolveApiBaseUrl(): string {
  return process.env.PLAYWRIGHT_API_URL ?? process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:2567";
}

async function ensureTokenViaApi(
  request: APIRequestContext,
  apiBaseUrl: string,
  creds: Creds,
): Promise<string> {
  const register = await request.post(`${apiBaseUrl}/api/auth/register`, {
    data: {
      email: creds.email,
      password: creds.password,
      username: creds.username,
      displayName: creds.username,
    },
  });
  if (register.ok()) {
    const registerBody = (await register.json()) as { token?: string };
    if (registerBody.token) {
      return registerBody.token;
    }
  }

  let lastLoginStatus = 0;
  let lastLoginBody = "";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const login = await request.post(`${apiBaseUrl}/api/auth/login`, {
      data: { email: creds.email, password: creds.password },
    });

    if (login.ok()) {
      const body = (await login.json()) as { token?: string };
      expect(body.token).toBeTruthy();
      return body.token as string;
    }

    lastLoginStatus = login.status();
    lastLoginBody = await login.text();
    if (![429, 500, 502, 503].includes(lastLoginStatus)) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
  }

  throw new Error(`Login failed after retries: status=${lastLoginStatus}, body=${lastLoginBody}`);
}

async function hydrateToken(page: Page, token: string) {
  await page.addInitScript((t) => {
    window.localStorage.setItem("auth_token", t);
  }, token);
}

async function goToLessonsCatalog(page: Page) {
  await page.goto("/lobby", { waitUntil: "domcontentloaded" });
  const lessonsTab = page.getByText(/^Lessons$/i).first();
  await expect(lessonsTab).toBeVisible({ timeout: 12_000 });
  await lessonsTab.click();
  await expect(page.locator('[data-testid^="lesson-card-"]').first()).toBeVisible({ timeout: 12_000 });
}

async function openLessonFromCatalog(page: Page, lessonId: string, lessonTitle: string) {
  await goToLessonsCatalog(page);

  const byTestId = page.locator(`[data-testid="lesson-card-${lessonId}"]`).first();
  if (await byTestId.isVisible().catch(() => false)) {
    await byTestId.click();
  } else {
    const byTitle = page.getByText(new RegExp(`^${lessonTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)).first();
    await expect(byTitle).toBeVisible({ timeout: 12_000 });
    await byTitle.click();
  }

  await expect(page.getByText(/Step \d+\/\d+/)).toBeVisible({ timeout: 12_000 });
}

async function submitActionStep(page: Page) {
  const candidates = [/^raise$/i, /^bet$/i, /^call$/i, /^check$/i, /^fold$/i];
  for (const re of candidates) {
    const btn = page.getByText(re).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      return;
    }
  }
  throw new Error("No ActionBar action button was visible");
}

async function completeLessonRuntime(page: Page, detail: LessonDetail["lesson"]) {
  const orderedSteps = [...detail.steps]
    .filter((step) => step.type !== "INFO_STEP")
    .sort((a, b) => a.sequence - b.sequence);

  for (const [idx, step] of orderedSteps.entries()) {
    await expect(page.getByText(/Step \d+\/\d+/i).first()).toBeVisible({ timeout: 12_000 });

    if (step.type === "MCQ_STEP") {
      const optionLabel = step.options?.[0]?.label ?? "";
      await expect(page.getByText(optionLabel).first()).toBeVisible({ timeout: 8_000 });
      await page.getByText(optionLabel).first().click();
      await page.getByText(/submit answer/i).first().click();
      await expect(page.getByText(/^Correct\.|^Not ideal\.|^Not quite\./i).first()).toBeVisible({ timeout: 8_000 });
    } else if (step.type === "ACTION_STEP") {
      await submitActionStep(page);
      await expect(page.getByText(/Evaluating decision|^Correct\.|^Not ideal\.|^Not quite\./i).first()).toBeVisible({ timeout: 8_000 });
    }

    if (idx < orderedSteps.length - 1) {
      await page.getByText(/^Next$/i).first().click();
    }
  }

  const backBtn = page.getByText(/Back to Lessons|Back to Boot Camp|Continue with Advanced Drills/i).first();
  if (await backBtn.isVisible().catch(() => false)) {
    await backBtn.click();
    return;
  }

  await page.goto("/lessons", { waitUntil: "domcontentloaded" });
}

async function assertCompletedInCatalog(page: Page, lessonId: string, lessonTitle: string) {
  await goToLessonsCatalog(page);

  const chip = page.locator(`[data-testid="lesson-state-${lessonId}"]`).first();
  if (await chip.isVisible().catch(() => false)) {
    await expect(chip).toContainText(/Completed/i);
    return;
  }

  const title = page.getByText(new RegExp(`^${lessonTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)).first();
  if (await title.isVisible().catch(() => false)) {
    await expect(page.getByText(/Completed/i).first()).toBeVisible();
  }
}

test.describe("lessons instructor loop", () => {
  test("can complete all seeded lessons and reflect completed state", async ({
    page,
    request,
  }) => {
    test.setTimeout(420_000);

    const apiBaseUrl = resolveApiBaseUrl();
    const now = Date.now();
    const creds: Creds = {
      email: `lessons-ui-${now}@example.com`,
      password: "Pass1234!",
      username: `lessons_ui_${String(now).slice(-6)}`,
    };

    const token = await ensureTokenViaApi(request, apiBaseUrl, creds);
    await hydrateToken(page, token);

    const firstListRes = await request.get(`${apiBaseUrl}/api/lessons`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(firstListRes.ok()).toBeTruthy();
    const firstListBody = (await firstListRes.json()) as { lessons: LessonListRow[] };
    expect(firstListBody.lessons.length).toBeGreaterThanOrEqual(12);

    const lessonIds = firstListBody.lessons.map((lesson) => lesson.id);

    for (const lessonId of lessonIds) {
      const detailRes = await request.get(`${apiBaseUrl}/api/lessons/${lessonId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(detailRes.ok()).toBeTruthy();
      const detailBody = (await detailRes.json()) as LessonDetail;
      expect(detailBody.lesson.steps.length).toBeGreaterThanOrEqual(2);

      await openLessonFromCatalog(page, lessonId, detailBody.lesson.title);
      await completeLessonRuntime(page, detailBody.lesson);
      await assertCompletedInCatalog(page, lessonId, detailBody.lesson.title);

      const listRes = await request.get(`${apiBaseUrl}/api/lessons`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(listRes.ok()).toBeTruthy();
      const listBody = (await listRes.json()) as { lessons: LessonListRow[] };
      const updated = listBody.lessons.find((lesson) => lesson.id === lessonId);
      expect(updated?.progressState).toBe("completed");
    }

    const finalListRes = await request.get(`${apiBaseUrl}/api/lessons`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(finalListRes.ok()).toBeTruthy();
    const finalListBody = (await finalListRes.json()) as { lessons: LessonListRow[] };
    const completedCount = finalListBody.lessons.filter((lesson) => lesson.progressState === "completed").length;
    expect(completedCount).toBeGreaterThanOrEqual(lessonIds.length);

    const masteryRes = await request.get(`${apiBaseUrl}/api/lessons/mastery`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(masteryRes.ok()).toBeTruthy();
    const masteryBody = (await masteryRes.json()) as { concepts?: Array<{ code: string }> };
    expect(Array.isArray(masteryBody.concepts ?? [])).toBeTruthy();
  });
});

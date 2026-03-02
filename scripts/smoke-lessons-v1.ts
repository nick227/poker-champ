import "dotenv/config";
import express from "express";
import { authRouter } from "../src/engine/auth/AuthRouter.js";
import { lessonsRouter } from "../src/http/LessonsRouter.js";
import { disconnectPrisma } from "../src/db/prisma.js";

type LessonListItem = {
  id: string;
  title: string;
  hasAccess?: boolean;
};

type LessonDetail = {
  lesson: {
    id: string;
    steps: Array<{
      id: string;
      sequence: number;
      type: "INFO_STEP" | "MCQ_STEP" | "ACTION_STEP";
      options?: Array<{ optionKey: string }>;
    }>;
  };
};

function assertOk(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function run() {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  app.use("/api/lessons", lessonsRouter);

  const server = app.listen(0);
  const address = server.address();
  assertOk(address && typeof address === "object", "Failed to bind smoke server");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const registerEmail = `lessons-smoke-${Date.now()}@example.com`;
    const registerRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: registerEmail,
        password: "Pass1234!",
        username: `smoke_${Date.now().toString().slice(-6)}`,
        displayName: "Lessons Smoke",
      }),
    });
    assertOk(registerRes.ok, `Register failed (${registerRes.status})`);
    const registerBody = (await registerRes.json()) as { token?: string };
    assertOk(registerBody.token, "Register response missing token");
    const authHeader = { authorization: `Bearer ${registerBody.token}` };

    const listRes = await fetch(`${baseUrl}/api/lessons`, { headers: authHeader });
    assertOk(listRes.ok, `Lessons list failed (${listRes.status})`);
    const listBody = (await listRes.json()) as { lessons?: LessonListItem[] };
    assertOk(Array.isArray(listBody.lessons), "Lessons list missing lessons array");
    assertOk(listBody.lessons.length >= 12, `Expected >=12 lessons, got ${listBody.lessons.length}`);

    const results: Array<{
      lessonId: string;
      status: string;
      submittedSteps: number;
    }> = [];

    for (const lesson of listBody.lessons) {
      const detailRes = await fetch(`${baseUrl}/api/lessons/${encodeURIComponent(lesson.id)}`, {
        headers: authHeader,
      });
      assertOk(detailRes.ok, `Lesson detail failed for ${lesson.id} (${detailRes.status})`);
      const detailBody = (await detailRes.json()) as LessonDetail;
      const steps = [...(detailBody.lesson.steps ?? [])].sort((a, b) => a.sequence - b.sequence);
      assertOk(steps.length >= 2, `Lesson ${lesson.id} expected >=2 steps`);

      const startRes = await fetch(`${baseUrl}/api/lessons/${encodeURIComponent(lesson.id)}/attempts`, {
        method: "POST",
        headers: {
          ...authHeader,
          "content-type": "application/json",
        },
      });
      assertOk(startRes.ok, `Start attempt failed for ${lesson.id} (${startRes.status})`);
      const startBody = (await startRes.json()) as { attempt?: { id: string } };
      assertOk(startBody.attempt?.id, `Start attempt missing id for ${lesson.id}`);
      const attemptId = startBody.attempt.id;

      let latestStatus = "IN_PROGRESS";
      for (const step of steps) {
        const answer =
          step.type === "ACTION_STEP"
            ? { type: "fold" }
            : step.type === "MCQ_STEP"
              ? { optionKey: step.options?.[0]?.optionKey ?? "a" }
              : { acknowledged: true };

        const submitRes = await fetch(
          `${baseUrl}/api/lessons/${encodeURIComponent(lesson.id)}/attempts/${encodeURIComponent(attemptId)}/steps/${encodeURIComponent(step.id)}/submit`,
          {
            method: "POST",
            headers: {
              ...authHeader,
              "content-type": "application/json",
            },
            body: JSON.stringify({ answer }),
          },
        );
        assertOk(submitRes.ok, `Submit failed for ${lesson.id}/${step.id} (${submitRes.status})`);
        const submitBody = (await submitRes.json()) as { attempt?: { status?: string } };
        latestStatus = submitBody.attempt?.status ?? latestStatus;
      }

      assertOk(latestStatus === "COMPLETED", `Attempt not completed for ${lesson.id} (status=${latestStatus})`);
      results.push({ lessonId: lesson.id, status: latestStatus, submittedSteps: steps.length });
    }

    const masteryRes = await fetch(`${baseUrl}/api/lessons/mastery`, { headers: authHeader });
    assertOk(masteryRes.ok, `Mastery endpoint failed (${masteryRes.status})`);
    const masteryBody = (await masteryRes.json()) as { concepts?: Array<{ code: string }> };
    const masteryConcepts = masteryBody.concepts?.length ?? 0;

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          status: "ok",
          lessonsValidated: results.length,
          masteryConcepts,
          sample: results.slice(0, 3),
        },
        null,
        2,
      ),
    );
  } finally {
    server.close();
    await disconnectPrisma().catch(() => undefined);
  }
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Lessons smoke failed:", error?.message ?? error);
  process.exit(1);
});

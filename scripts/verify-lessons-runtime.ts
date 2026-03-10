import "dotenv/config";
import express from "express";
import { authRouter } from "../apps/server/src/engine/auth/AuthRouter.js";
import { lessonsRouter } from "../apps/server/src/http/LessonsRouter.js";
import { disconnectPrisma } from "@poker-champ/db";

function assertOk(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type AuthHeader = { authorization: string };

async function register(baseUrl: string, suffix: string): Promise<AuthHeader> {
  const registerRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `lessons-runtime-${suffix}-${Date.now()}@example.com`,
      password: "Pass1234!",
      username: `runtime_${suffix}_${Date.now().toString().slice(-6)}`,
      displayName: `Runtime ${suffix}`,
    }),
  });
  assertOk(registerRes.ok, `register failed (${suffix}) status=${registerRes.status}`);
  const registerBody = (await registerRes.json()) as { token?: string };
  assertOk(registerBody.token, `register missing token (${suffix})`);
  return { authorization: `Bearer ${registerBody.token}` };
}

async function run() {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  app.use("/api/lessons", lessonsRouter);
  const server = app.listen(0);
  const address = server.address();
  assertOk(address && typeof address === "object", "failed to bind test server");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const u1 = await register(baseUrl, "u1");
    const u2 = await register(baseUrl, "u2");
    const u3 = await register(baseUrl, "u3");

    const listRes = await fetch(`${baseUrl}/api/lessons`, { headers: u1 });
    assertOk(listRes.ok, `lessons list failed status=${listRes.status}`);
    const listBody = (await listRes.json()) as { lessons?: Array<{ id: string }> };
    assertOk(Array.isArray(listBody.lessons), "lessons list missing array");
    assertOk(listBody.lessons.length >= 15, `expected at least 15 visible lessons, got ${listBody.lessons.length}`);

    const l01Res = await fetch(`${baseUrl}/api/lessons/L01`, { headers: u1 });
    assertOk(l01Res.ok, `L01 detail failed status=${l01Res.status}`);
    const l01Body = (await l01Res.json()) as any;
    const l01DecisionStep = l01Body.lesson.steps.find((step: any) => step.type === "ACTION_STEP");
    assertOk(l01DecisionStep, "L01 decision step missing");

    const l13Res = await fetch(`${baseUrl}/api/lessons/L13`, { headers: u1 });
    assertOk(l13Res.ok, `L13 detail failed status=${l13Res.status}`);
    const l13Body = (await l13Res.json()) as any;
    const l13DecisionStep = l13Body.lesson.steps.find((step: any) => step.type === "ACTION_STEP");
    assertOk(l13DecisionStep, "L13 decision step missing");

    for (const [auth, action] of [
      [u1, "call"],
      [u2, "fold"],
      [u3, "call"],
    ] as const) {
      const startRes = await fetch(`${baseUrl}/api/lessons/L01/attempts`, {
        method: "POST",
        headers: auth,
      });
      assertOk(startRes.ok, `L01 attempt start failed status=${startRes.status}`);
      const startBody = (await startRes.json()) as { attempt?: { id?: string } };
      const attemptId = startBody.attempt?.id;
      assertOk(attemptId, "L01 attempt id missing");

      const introSubmitRes = await fetch(`${baseUrl}/api/lessons/L01/attempts/${attemptId}/steps/L01_intro/submit`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ answer: { acknowledged: true } }),
      });
      assertOk(introSubmitRes.ok, `L01 intro submit failed status=${introSubmitRes.status}`);

      const decisionSubmitRes = await fetch(
        `${baseUrl}/api/lessons/L01/attempts/${attemptId}/steps/${encodeURIComponent(l01DecisionStep.id)}/submit`,
        {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify({ answer: { type: action } }),
        },
      );
      assertOk(decisionSubmitRes.ok, `L01 decision submit failed status=${decisionSubmitRes.status}`);
    }

    const replayStartRes = await fetch(`${baseUrl}/api/lessons/L01/attempts`, {
      method: "POST",
      headers: u1,
    });
    assertOk(replayStartRes.ok, `L01 replay start failed status=${replayStartRes.status}`);
    const replayStartBody = (await replayStartRes.json()) as { attempt?: { id?: string } };
    const replayAttemptId = replayStartBody.attempt?.id;
    assertOk(replayAttemptId, "L01 replay attempt id missing");

    const replaySubmitOne = await fetch(
      `${baseUrl}/api/lessons/L01/attempts/${replayAttemptId}/steps/${encodeURIComponent(l01DecisionStep.id)}/submit`,
      {
        method: "POST",
        headers: { ...u1, "content-type": "application/json" },
        body: JSON.stringify({ answer: { type: "call" } }),
      },
    );
    assertOk(replaySubmitOne.ok, `L01 replay first submit failed status=${replaySubmitOne.status}`);

    const replaySubmitTwo = await fetch(
      `${baseUrl}/api/lessons/L01/attempts/${replayAttemptId}/steps/${encodeURIComponent(l01DecisionStep.id)}/submit`,
      {
        method: "POST",
        headers: { ...u1, "content-type": "application/json" },
        body: JSON.stringify({ answer: { type: "fold" } }),
      },
    );
    assertOk(replaySubmitTwo.ok, `L01 replay second submit failed status=${replaySubmitTwo.status}`);
    const replaySecondBody = (await replaySubmitTwo.json()) as { idempotentReplay?: boolean };

    const overviewRes = await fetch(
      `${baseUrl}/api/lessons/utilities/overview?lessonId=L01&stepId=${encodeURIComponent(l01DecisionStep.id)}`,
      { headers: u1 },
    );
    assertOk(overviewRes.ok, `L01 utilities overview failed status=${overviewRes.status}`);
    const overviewBody = (await overviewRes.json()) as any;

    const l13StartRes = await fetch(`${baseUrl}/api/lessons/L13/attempts`, {
      method: "POST",
      headers: u1,
    });
    assertOk(l13StartRes.ok, `L13 attempt start failed status=${l13StartRes.status}`);
    const l13StartBody = (await l13StartRes.json()) as { attempt?: { id?: string } };
    const l13AttemptId = l13StartBody.attempt?.id;
    assertOk(l13AttemptId, "L13 attempt id missing");

    const l13IntroRes = await fetch(`${baseUrl}/api/lessons/L13/attempts/${l13AttemptId}/steps/L13_intro/submit`, {
      method: "POST",
      headers: { ...u1, "content-type": "application/json" },
      body: JSON.stringify({ answer: { acknowledged: true } }),
    });
    assertOk(l13IntroRes.ok, `L13 intro submit failed status=${l13IntroRes.status}`);

    const l13DecisionRes = await fetch(
      `${baseUrl}/api/lessons/L13/attempts/${l13AttemptId}/steps/${encodeURIComponent(l13DecisionStep.id)}/submit`,
      {
        method: "POST",
        headers: { ...u1, "content-type": "application/json" },
        body: JSON.stringify({ answer: { type: "call" } }),
      },
    );
    assertOk(l13DecisionRes.ok, `L13 decision submit failed status=${l13DecisionRes.status}`);
    const l13DecisionBody = (await l13DecisionRes.json()) as any;

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          lessonsVisible: listBody.lessons.length,
          l01DecisionStepId: l01DecisionStep.id,
          l13DecisionStepId: l13DecisionStep.id,
          l01ResponseDistributionKeys: Object.keys(overviewBody.communityComparison.responseDistribution ?? {}),
          l01ActionDistributionKeys: Object.keys(overviewBody.communityComparison.actionDistribution ?? {}),
          l01UserPercentile: overviewBody.communityComparison.userPercentile ?? null,
          idempotentReplayVerified: replaySecondBody.idempotentReplay === true,
          l13FeedbackEnvelope: {
            isCorrect: l13DecisionBody.feedback?.isCorrect ?? null,
            gradeBand: l13DecisionBody.feedback?.gradeBand ?? null,
            hasResponse: typeof l13DecisionBody.feedback?.response === "string",
            hasFollowUp: typeof l13DecisionBody.feedback?.followUpInstructorMessage === "string",
          },
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

run().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error("Runtime verify failed:", error?.message ?? error);
  await disconnectPrisma().catch(() => undefined);
  process.exit(1);
});


import express from "express";
import { z } from "zod";
import { requireAuth } from "../engine/auth/RequireAuth.js";
import { getPrisma } from "../db/prisma.js";
import { requireLessonAccess } from "./middleware/requireLessonAccess.js";
import { listLessons, getMastery } from "../lessons/LessonListService.js";
import { getLesson } from "../lessons/LessonDetailService.js";
import { getUtilitiesOverview } from "../lessons/LessonAnalyticsService.js";
import { startOrResumeAttempt, submitStep } from "../lessons/LessonAttemptService.js";

const asyncHandler =
  (fn: express.RequestHandler): express.RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const AttemptPathSchema = z.object({
  attemptId: z.string().min(1).max(191),
  stepId: z.string().min(1).max(191),
});

const SubmitBodySchema = z.object({
  answer: z.unknown(),
});

const OverviewQuerySchema = z.object({
  lessonId: z.string().optional(),
  stepId: z.string().optional(),
});

type ServiceResult<T> =
  | { ok: true; body: T; status?: number }
  | { ok: false; status: number; message?: string };

function handle<T>(res: express.Response, result: ServiceResult<T>): void {
  if (!result.ok) {
    res.status(result.status).json({ error: result.message ?? "Error" });
    return;
  }
  res.status(result.status ?? 200).json(result.body);
}

function requireUserId(req: express.Request, res: express.Response): string | null {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return req.user.id;
}

function createLessonsRouter(prisma: ReturnType<typeof getPrisma>) {
  const router = express.Router();
  router.use(requireAuth);

  router.get("/", asyncHandler(async (req, res) => {
    const userId = requireUserId(req, res);
    if (userId === null) return;
    const body = await listLessons(prisma, userId);
    res.json(body);
  }));

  router.get("/mastery", asyncHandler(async (req, res) => {
    const userId = requireUserId(req, res);
    if (userId === null) return;
    const body = await getMastery(prisma, userId);
    res.json(body);
  }));

  router.get("/utilities/overview", asyncHandler(async (req, res) => {
    const userId = requireUserId(req, res);
    if (userId === null) return;
    const parsed = OverviewQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query params" });
      return;
    }
    const lessonId = parsed.data.lessonId ?? null;
    const stepId = parsed.data.stepId ?? null;
    const result = await getUtilitiesOverview(prisma, userId, lessonId, stepId);
    handle(res, result);
  }));

  type LessonParams = { lessonId: string };
  const lessonIdFromParams = (req: express.Request) => (req.params as LessonParams).lessonId;
  const lessonRoutes = express.Router({ mergeParams: true });
  lessonRoutes.use(requireLessonAccess as express.RequestHandler);

  lessonRoutes.get("/", asyncHandler(async (req, res) => {
    const result = await getLesson(prisma, lessonIdFromParams(req));
    handle(res, result);
  }));

  lessonRoutes.post("/attempts", asyncHandler(async (req, res) => {
    const userId = requireUserId(req, res);
    if (userId === null) return;
    const result = await startOrResumeAttempt(prisma, lessonIdFromParams(req), userId);
    handle(res, result);
  }));

  lessonRoutes.post("/attempts/:attemptId/steps/:stepId/submit", asyncHandler(async (req, res) => {
    const pathParsed = AttemptPathSchema.safeParse(req.params);
    const bodyParsed = SubmitBodySchema.safeParse(req.body);
    if (!pathParsed.success) {
      res.status(400).json({ error: "Invalid path params" });
      return;
    }
    if (!bodyParsed.success) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }
    const userId = requireUserId(req, res);
    if (userId === null) return;
    const { attemptId, stepId } = pathParsed.data;
    const result = await submitStep(prisma, {
      lessonId: lessonIdFromParams(req),
      attemptId,
      stepId,
      userId,
      answer: bodyParsed.data.answer,
    });
    handle(res, result);
  }));

  router.use("/:lessonId", lessonRoutes);
  return router;
}

export const lessonsRouter = createLessonsRouter(getPrisma());

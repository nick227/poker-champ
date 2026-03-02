import type { Request, Response, NextFunction } from "express";
import { ContentAccessService } from "../../api/contentAccess.js";

export type AuthedRequest = Request & { user: { id: string } };

/**
 * Ensures the user has access to the lesson in req.params.lessonId.
 * Must run after requireAuth. Sends 403 if no access; otherwise calls next().
 */
export async function requireLessonAccess(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { lessonId } = req.params;
  if (!lessonId || typeof lessonId !== "string") {
    res.status(400).json({ error: "Invalid lesson id" });
    return;
  }
  const access = await ContentAccessService.checkContentAccess({
    contentId: lessonId,
    type: "lesson",
    userId: req.user.id,
  });
  if (!access.hasAccess) {
    res.status(403).json({ error: "LESSON_LOCKED", access });
    return;
  }
  next();
}

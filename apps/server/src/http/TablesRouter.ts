import express from "express";
import { z } from "zod";
import { requireAuth } from "../engine/auth/RequireAuth.js";
import { resumeCashTableForUser } from "../tables/cash-table-resume.js";

const router = express.Router();

const ResumeBodySchema = z
  .object({
    roomId: z.string().min(1).optional(),
  })
  .optional();

router.post("/:tableId/resume", requireAuth, async (req, res) => {
  const tableId = Array.isArray(req.params.tableId) ? req.params.tableId[0] : req.params.tableId;
  if (!tableId) {
    res.status(400).json({ error: "Table id is required" });
    return;
  }

  const parsedBody = ResumeBodySchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    res.status(400).json({ error: "Invalid resume payload", details: parsedBody.error.flatten() });
    return;
  }

  const userId = req.user!.id;
  const previousRoomId = parsedBody.data?.roomId ?? null;

  const result = await resumeCashTableForUser({
    tableId,
    userId,
    previousRoomId,
  });

  const httpStatus =
    result.resumeStatus === "FAILED" && result.recoveryReason === "TOURNAMENT_TABLE_USE_ENSURE_TABLE"
      ? 400
      : 200;

  res.status(httpStatus).json(result);
});

export default router;

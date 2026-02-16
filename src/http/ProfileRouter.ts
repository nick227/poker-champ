import express from "express";
import { z } from "zod";
import { requireAuth } from "../engine/auth/RequireAuth.js";
import { getPrisma } from "../db/prisma.js";
import { toPublicUser } from "../engine/auth/PublicUser.js";

const router = express.Router();

const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).max(80),
});

router.use(requireAuth);

router.get("/", async (req, res) => {
  res.json({ user: toPublicUser(req.user!) });
});

router.patch("/", async (req, res) => {
  const parsed = UpdateProfileSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid profile payload", details: parsed.error.flatten() });
    return;
  }

  const prisma = getPrisma();
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { displayName: parsed.data.displayName },
  });

  res.json({ user: toPublicUser(user) });
});

export const profileRouter = router;

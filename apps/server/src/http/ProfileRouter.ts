import express from "express";
import multer from "multer";
import { z } from "zod";
import { requireAuth } from "../engine/auth/RequireAuth.js";
import { getPrisma } from "@poker-champ/db";
import { toPublicUser } from "../engine/auth/PublicUser.js";
import { avatarStorageFs } from "../engine/avatar/AvatarStorage.js";
import { logger } from "../lib/logger.js";
import { getUserTournamentStats } from "../tournaments/tournament-user-stats.js";

const router = express.Router();

const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).max(80),
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const allowedMimes = new Set(["image/jpeg", "image/png", "image/webp"]);

router.use(requireAuth);

router.get("/", async (req, res) => {
  const tournamentStats = await getUserTournamentStats(req.user!.id);
  res.json({ user: toPublicUser(req.user!), tournamentStats });
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

router.post("/avatar", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "Missing file", code: "AVATAR_MISSING_FILE" });
    return;
  }
  if (!allowedMimes.has(file.mimetype)) {
    res.status(400).json({ error: "Unsupported image type", code: "AVATAR_BAD_MIME" });
    return;
  }

  const prisma = getPrisma();
  const userId = req.user!.id;
  const current = await prisma.user.findUnique({ where: { id: userId } });
  if (!current) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const nextVersion = (current.avatarVersion ?? 0) + 1;
  const ext = file.mimetype === "image/png" ? "png" : file.mimetype === "image/webp" ? "webp" : "jpg";

  const { publicUrl } = await avatarStorageFs.save({
    userId,
    version: nextVersion,
    buffer: file.buffer,
    ext,
  });

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      avatarUrl: publicUrl,
      avatarVersion: nextVersion,
      avatarUpdatedAt: new Date(),
    },
  });

  if (current.avatarUrl && current.avatarUrl !== publicUrl) {
    await avatarStorageFs.deleteByPublicUrl(current.avatarUrl);
  }

  logger.info(
    {
      userId,
      nextVersion,
      mimetype: file.mimetype,
      size: file.size,
      publicUrl,
    },
    "Profile avatar uploaded",
  );

  res.json({ avatarUrl: updated.avatarUrl, avatarVersion: updated.avatarVersion ?? null });
});

router.delete("/avatar", async (req, res) => {
  const prisma = getPrisma();
  const userId = req.user!.id;
  const current = await prisma.user.findUnique({ where: { id: userId } });
  if (!current) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      avatarUrl: null,
      avatarUpdatedAt: new Date(),
    },
  });

  if (current.avatarUrl) {
    await avatarStorageFs.deleteByPublicUrl(current.avatarUrl);
  }

  res.json({ avatarUrl: updated.avatarUrl, avatarVersion: updated.avatarVersion ?? null });
});

export const profileRouter = router;


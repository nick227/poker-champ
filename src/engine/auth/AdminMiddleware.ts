
import type { Request, Response, NextFunction } from "express";
import { requireAuth } from "./RequireAuth.js";

export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await requireAuth(req, res, () => undefined);
    if (!req.user) return;
    if (req.user.role !== "ADMIN") {
      res.status(403).json({ error: "Forbidden: Admin access required" });
      return;
    }
    next();
  } catch {
    res.status(500).json({ error: "Internal Server Error" });
  }
};

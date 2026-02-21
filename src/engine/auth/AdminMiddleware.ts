import type { Request, Response, NextFunction } from "express";

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.sendStatus(401);
    return;
  }
  if (req.user.role !== "ADMIN") {
    res.sendStatus(403);
    return;
  }
  next();
}

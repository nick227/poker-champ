import type { NextFunction, Request, Response } from "express";
import { AuthService } from "./AuthService.js";

function parseBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = parseBearerToken(req);
    if (!token) {
      res.status(401).json({ error: "Missing or invalid Authorization header" });
      return;
    }

    const user = await AuthService.validateSession(token);
    if (!user) {
      res.status(401).json({ error: "Invalid or expired session" });
      return;
    }

    req.user = user;
    next();
  } catch (err: any) {
    if (err?.code === "AUTH_BACKEND_UNAVAILABLE") {
      res.status(503).json({ error: "Auth service unavailable", code: "AUTH_BACKEND_UNAVAILABLE" });
      return;
    }
    res.status(500).json({ error: "Internal Server Error" });
  }
}

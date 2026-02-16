import express from "express";
import { AuthService } from "./AuthService.js";
import { requireAuth } from "./RequireAuth.js";
import { openApiSpec } from "../../http/openapi.js";
import { toPublicUser } from "./PublicUser.js";

const router = express.Router();

router.post("/register", async (req, res) => {
  try {
    const { email, password, displayName, username } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const result = await AuthService.register(email, password, displayName || "Player", username);
    res.json({ token: result.token, user: toPublicUser(result.user) });
  } catch (err: any) {
    if (err?.message === "Email already registered" || err?.message === "Username already taken" || String(err?.message ?? "").startsWith("Username must be at least")) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: err?.message ?? "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const result = await AuthService.login(email, password);
    res.json({ token: result.token, user: toPublicUser(result.user) });
  } catch (err: any) {
    const message = err?.message ?? "Login failed";
    if (message === "Invalid credentials" || message === "Account is suspended") {
      res.status(401).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  res.json({ user: toPublicUser(req.user!), openapiVersion: openApiSpec.info.version });
});

router.post("/logout", requireAuth, async (req, res) => {
  try {
    const authHeader = req.headers.authorization as string;
    const token = authHeader.slice("Bearer ".length).trim();
    await AuthService.revokeSession(token);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? "Unable to log out" });
  }
});

router.post("/logout-all", requireAuth, async (req, res) => {
  try {
    await AuthService.revokeUserSessions(req.user!.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? "Unable to log out all sessions" });
  }
});

export const authRouter = router;

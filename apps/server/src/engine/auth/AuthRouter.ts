import express from "express";
import { AuthService } from "./AuthService.js";
import { requireAuth } from "./RequireAuth.js";
import { openApiSpec } from "../../http/openapi.js";
import { toPublicUser } from "./PublicUser.js";

const router = express.Router();

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

// Shared by reset-password/verify-email: both map AuthService's token-validation error to a
// 400 with a stable code, and anything else to a generic 500.
function respondToTokenError(res: express.Response, err: any, fallbackMessage: string): void {
  if (err?.code === "INVALID_OR_EXPIRED_TOKEN") {
    res.status(400).json({ error: err.message, code: err.code });
    return;
  }
  res.status(500).json({ error: err?.message ?? fallbackMessage });
}

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

// Generic response used for both branches of forgot-password so callers cannot distinguish
// "email exists" from "email does not exist" (anti-enumeration).
const FORGOT_PASSWORD_RESPONSE = {
  success: true,
  message: "If an account with that email exists, a password reset link has been sent.",
};

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body ?? {};
    if (!email || typeof email !== "string") {
      res.status(400).json({ error: "Email is required" });
      return;
    }

    await AuthService.requestPasswordReset(email);
    res.json(FORGOT_PASSWORD_RESPONSE);
  } catch (err: any) {
    // Even on unexpected errors, avoid leaking whether the email exists.
    res.json(FORGOT_PASSWORD_RESPONSE);
  }
});

// Input validation + a single error-code branch, same shape as the pre-existing /register and
// /login handlers above; covered by AuthRouter.password-reset-and-verification.test.ts.
router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body ?? {};
    if (!isNonEmptyString(token) || !isNonEmptyString(password)) {
      res.status(400).json({ error: "Token and new password are required" });
      return;
    }

    await AuthService.resetPassword(token, password);
    res.json({ success: true });
  } catch (err: any) {
    respondToTokenError(res, err, "Unable to reset password");
  }
});

// Same shape as reset-password above; covered by AuthRouter.password-reset-and-verification.test.ts.
router.post("/verify-email", async (req, res) => {
  try {
    const { token } = req.body ?? {};
    if (!isNonEmptyString(token)) {
      res.status(400).json({ error: "Token is required" });
      return;
    }

    const user = await AuthService.verifyEmail(token);
    res.json({ success: true, user: toPublicUser(user) });
  } catch (err: any) {
    respondToTokenError(res, err, "Unable to verify email");
  }
});

router.post("/resend-verification", requireAuth, async (req, res) => {
  try {
    await AuthService.issueEmailVerificationToken(req.user!.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Unable to resend verification email" });
  }
});

export const authRouter = router;

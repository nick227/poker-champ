import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "node:http";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";

type SentMail = { to: string; subject: string; text: string };

const sentMail: SentMail[] = [];

vi.mock("../../lib/mailer.js", () => ({
  getMailer: () => ({
    sendMail: async (message: SentMail) => {
      sentMail.push(message);
    },
  }),
}));

import { authRouter } from "./AuthRouter.js";

function extractToken(text: string): string {
  const match = text.match(/token=([^\s&]+)/);
  if (!match) throw new Error(`No token found in email text: ${text}`);
  return match[1];
}

const app = express();
app.use(express.json());
app.use("/api/auth", authRouter);

describe("AuthRouter: password reset + email verification", () => {
  let server: http.Server;
  let baseUrl: string;
  const testRunId = nanoid(6);
  const createdUserIds: string[] = [];
  let userCounter = 0;

  async function post(path: string, body?: unknown, token?: string) {
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body == null ? undefined : JSON.stringify(body),
    });
  }

  async function get(path: string, token?: string) {
    return fetch(`${baseUrl}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }

  async function registerUser(labelSuffix: string) {
    userCounter += 1;
    const email = `authflow_${testRunId}_${userCounter}_${labelSuffix}@test.com`;
    const res = await post("/api/auth/register", {
      email,
      password: "OldPassw0rd!1",
      displayName: "Test User",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; user: { id: string } };
    createdUserIds.push(body.user.id);
    return { email, userId: body.user.id, sessionToken: body.token };
  }

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    const prisma = getPrisma();
    await prisma.userSession.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    sentMail.length = 0;
  });

  describe("forgot-password", () => {
    it("returns the same generic success response for an existing and a non-existing email", async () => {
      const { email } = await registerUser("fp_exists");
      sentMail.length = 0;

      const existingRes = await post("/api/auth/forgot-password", { email });
      const missingRes = await post("/api/auth/forgot-password", {
        email: `does_not_exist_${testRunId}@test.com`,
      });

      expect(existingRes.status).toBe(missingRes.status);
      expect(existingRes.status).toBe(200);

      const existingBody = await existingRes.json();
      const missingBody = await missingRes.json();
      expect(existingBody).toEqual(missingBody);

      // Only the real user actually receives an email — proves the endpoint itself doesn't leak.
      expect(sentMail).toHaveLength(1);
      expect(sentMail[0].to).toBe(email.toLowerCase());
    });
  });

  describe("reset-password", () => {
    it("rejects a malformed/unknown token", async () => {
      const res = await post("/api/auth/reset-password", { token: "not-a-real-token", password: "Whatever1!" });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("INVALID_OR_EXPIRED_TOKEN");
    });

    it("rejects an expired token", async () => {
      const { email, userId } = await registerUser("fp_expired");
      await post("/api/auth/forgot-password", { email });
      const rawToken = extractToken(sentMail[sentMail.length - 1].text);

      // Force the stored token to already be expired.
      const prisma = getPrisma();
      await prisma.user.update({
        where: { id: userId },
        data: { passwordResetTokenExpiresAt: new Date(Date.now() - 1000) },
      });

      const res = await post("/api/auth/reset-password", { token: rawToken, password: "NewPassw0rd!1" });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("INVALID_OR_EXPIRED_TOKEN");
    });

    it("resets the password, allows login with the new password (not the old one), revokes other sessions, and is single-use", async () => {
      const { email, sessionToken: originalSessionToken } = await registerUser("fp_full");
      await post("/api/auth/forgot-password", { email });
      const rawToken = extractToken(sentMail[sentMail.length - 1].text);

      const resetRes = await post("/api/auth/reset-password", { token: rawToken, password: "NewPassw0rd!1" });
      expect(resetRes.status).toBe(200);

      // Old session must be revoked.
      const meWithOldSession = await get("/api/auth/me", originalSessionToken);
      expect(meWithOldSession.status).toBe(401);

      // Old password no longer works.
      const loginOld = await post("/api/auth/login", { email, password: "OldPassw0rd!1" });
      expect(loginOld.status).toBe(401);

      // New password works.
      const loginNew = await post("/api/auth/login", { email, password: "NewPassw0rd!1" });
      expect(loginNew.status).toBe(200);

      // Token is single-use: reusing it must fail even with a valid new password value.
      const secondUse = await post("/api/auth/reset-password", { token: rawToken, password: "AnotherPass1!" });
      expect(secondUse.status).toBe(400);
      const secondUseBody = await secondUse.json();
      expect(secondUseBody.code).toBe("INVALID_OR_EXPIRED_TOKEN");
    });
  });

  describe("email verification", () => {
    it("sends a verification email on registration and verify-email sets emailVerifiedAt", async () => {
      sentMail.length = 0;
      const { sessionToken } = await registerUser("verify_full");
      expect(sentMail).toHaveLength(1);
      const rawToken = extractToken(sentMail[0].text);

      const meBefore = await get("/api/auth/me", sessionToken);
      const meBeforeBody = await meBefore.json();
      expect(meBeforeBody.user.emailVerifiedAt).toBeNull();

      const verifyRes = await post("/api/auth/verify-email", { token: rawToken });
      expect(verifyRes.status).toBe(200);
      const verifyBody = await verifyRes.json();
      expect(verifyBody.user.emailVerifiedAt).not.toBeNull();

      const meAfter = await get("/api/auth/me", sessionToken);
      const meAfterBody = await meAfter.json();
      expect(meAfterBody.user.emailVerifiedAt).not.toBeNull();
    });

    it("rejects a wrong/malformed verification token", async () => {
      const res = await post("/api/auth/verify-email", { token: "totally-bogus" });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("INVALID_OR_EXPIRED_TOKEN");
    });

    it("rejects an expired verification token", async () => {
      sentMail.length = 0;
      const { userId } = await registerUser("verify_expired");
      const rawToken = extractToken(sentMail[0].text);

      const prisma = getPrisma();
      await prisma.user.update({
        where: { id: userId },
        data: { emailVerificationTokenExpiresAt: new Date(Date.now() - 1000) },
      });

      const res = await post("/api/auth/verify-email", { token: rawToken });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("INVALID_OR_EXPIRED_TOKEN");
    });

    it("rejects reusing an already-consumed verification token", async () => {
      sentMail.length = 0;
      await registerUser("verify_reuse");
      const rawToken = extractToken(sentMail[0].text);

      const firstUse = await post("/api/auth/verify-email", { token: rawToken });
      expect(firstUse.status).toBe(200);

      const secondUse = await post("/api/auth/verify-email", { token: rawToken });
      expect(secondUse.status).toBe(400);
      const secondUseBody = await secondUse.json();
      expect(secondUseBody.code).toBe("INVALID_OR_EXPIRED_TOKEN");
    });

    it("resend-verification requires authentication", async () => {
      const res = await post("/api/auth/resend-verification");
      expect(res.status).toBe(401);
    });

    it("resend-verification sends a new token that verifies successfully", async () => {
      sentMail.length = 0;
      const { sessionToken } = await registerUser("verify_resend");
      expect(sentMail).toHaveLength(1);

      const resendRes = await post("/api/auth/resend-verification", undefined, sessionToken);
      expect(resendRes.status).toBe(200);
      expect(sentMail).toHaveLength(2);

      const rawToken = extractToken(sentMail[1].text);
      const verifyRes = await post("/api/auth/verify-email", { token: rawToken });
      expect(verifyRes.status).toBe(200);
    });

    it("resend-verification is a no-op (no new email) once already verified", async () => {
      sentMail.length = 0;
      const { sessionToken } = await registerUser("verify_already");
      const rawToken = extractToken(sentMail[0].text);

      const verifyRes = await post("/api/auth/verify-email", { token: rawToken });
      expect(verifyRes.status).toBe(200);

      sentMail.length = 0;
      const resendRes = await post("/api/auth/resend-verification", undefined, sessionToken);
      expect(resendRes.status).toBe(200);
      expect(sentMail).toHaveLength(0);
    });
  });
});

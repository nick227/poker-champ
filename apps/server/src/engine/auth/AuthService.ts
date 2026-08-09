import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import { User } from "@prisma/client";
import { getPrisma } from "@poker-champ/db";
import { logger } from "../../lib/logger.js";
import { getMailer } from "../../lib/mailer.js";

type AuthToken = string;
const DEFAULT_SESSION_TTL_DAYS = 14;
const MIN_USERNAME_LEN = 3;
const MAX_USERNAME_LEN = 24;
const STARTING_BANKROLL_CENTS = 1_000_000;
const PASSWORD_RESET_TOKEN_TTL_MS = 45 * 60 * 1000; // 45 minutes
const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const TOKEN_HASH_SALT_ROUNDS = 10;

class AuthBackendUnavailableError extends Error {
  readonly code = "AUTH_BACKEND_UNAVAILABLE";
  constructor() {
    super("Auth backend unavailable");
  }
}

// Not exported (matches AuthBackendUnavailableError above): callers should branch on
// err.code, not on class identity — see reset-password/verify-email in AuthRouter.ts.
class InvalidOrExpiredTokenError extends Error {
  readonly code = "INVALID_OR_EXPIRED_TOKEN";
  constructor() {
    super("Invalid or expired token");
  }
}

// Exported for future callers (e.g. a cash-out gate) that want `instanceof` rather than a
// string-code check; see AuthService.assertEmailVerified below.
export class EmailNotVerifiedError extends Error {
  readonly code = "EMAIL_NOT_VERIFIED";
  constructor() {
    super("Email verification is required for this action");
  }
}

export class AuthService {
  static async register(
    email: string,
    password: string,
    displayName: string,
    usernameInput?: string,
  ): Promise<{ token: AuthToken; user: User }> {
    const prisma = getPrisma();

    const normalizedEmail = this.normalizeEmail(email);
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      throw new Error("Email already registered");
    }

    const handle = await this.allocateUsername(normalizedEmail, usernameInput);
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        username: handle.username,
        usernameNormalized: handle.usernameNormalized,
        passwordHash,
        displayName,
        role: "USER",
        bankrollCents: STARTING_BANKROLL_CENTS,
      },
    });

    const token = await this.createSession(user.id);

    // issueEmailVerificationToken already catches its own mail-send errors internally, so a
    // slow/broken mailer cannot fail registration; we still await it so the token exists (and
    // the email has been handed off) by the time this call returns.
    try {
      await this.issueEmailVerificationToken(user.id);
    } catch (err: unknown) {
      logger.error({ err, userId: user.id }, "Failed to issue email verification token during registration");
    }

    return { token, user };
  }

  static async login(email: string, password: string): Promise<{ token: AuthToken; user: User }> {
    const prisma = getPrisma();
    const normalizedEmail = this.normalizeEmail(email);

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      throw new Error("Invalid credentials");
    }

    if (user.isBanned || user.deletedAt) {
      throw new Error("Account is suspended");
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new Error("Invalid credentials");
    }

    const hydrated = await this.ensureUserHandle(user);
    await this.revokeUserSessions(hydrated.id);
    const token = await this.createSession(user.id);
    return { token, user: hydrated };
  }

  static async validateSession(token: string): Promise<User | null> {
    const prisma = getPrisma();
    try {
      const session = await prisma.userSession.findUnique({
        where: { id: token },
        include: { user: true },
      });

      if (!session) return null;

      if (session.expiresAt < new Date()) {
        await prisma.userSession.delete({ where: { id: token } });
        return null;
      }

      if (session.user.isBanned || session.user.deletedAt) return null;

      const now = new Date();
      await prisma.userSession.update({
        where: { id: token },
        data: {
          lastUsedAt: now,
          expiresAt: new Date(now.getTime() + this.getSessionTtlMs()),
        },
      });

      return this.ensureUserHandle(session.user);
    } catch (err: unknown) {
      logger.error({ err }, "validateSession failed due to backend error");
      throw new AuthBackendUnavailableError();
    }
  }

  static async revokeSession(token: string): Promise<void> {
    const prisma = getPrisma();
    await prisma.userSession.deleteMany({ where: { id: token } });
  }

  static async revokeUserSessions(userId: string): Promise<void> {
    const prisma = getPrisma();
    await prisma.userSession.deleteMany({ where: { userId } });
  }

  /**
   * Starts a password reset for the given email, if it belongs to an active account.
   * Always resolves without error, regardless of whether the email matched a user
   * (anti-enumeration: callers must not be able to distinguish the two cases).
   */
  static async requestPasswordReset(email: string): Promise<void> {
    const prisma = getPrisma();
    const normalizedEmail = this.normalizeEmail(email);
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user || user.isBanned || user.deletedAt) {
      return;
    }

    const { token, hash } = await this.generateOpaqueToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: hash,
        passwordResetTokenExpiresAt: expiresAt,
      },
    });

    const resetUrl = `${this.getAppUrl()}/reset-password?token=${token}`;
    try {
      await getMailer().sendMail({
        to: user.email,
        subject: "Reset your Poker Champ password",
        text: `We received a request to reset your password.\n\nReset it here: ${resetUrl}\n\nThis link expires in 45 minutes. If you didn't request this, you can safely ignore this email.`,
      });
    } catch (err: unknown) {
      logger.error({ err, userId: user.id }, "Failed to send password reset email");
    }
  }

  /**
   * Completes a password reset: validates the raw token against the stored hash, and if
   * valid (and not expired), updates the password, clears the token (single-use), and
   * revokes every existing session for the user.
   */
  static async resetPassword(token: string, newPassword: string): Promise<void> {
    const prisma = getPrisma();
    const matched = await this.findUserByOpaqueToken(token, "passwordReset");
    if (!matched) {
      throw new InvalidOrExpiredTokenError();
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: matched.id },
      data: {
        passwordHash,
        passwordResetTokenHash: null,
        passwordResetTokenExpiresAt: null,
      },
    });

    await this.revokeUserSessions(matched.id);
  }

  /**
   * (Re)issues an email verification token for the given user and emails it. No-ops if the
   * user is already verified.
   */
  static async issueEmailVerificationToken(userId: string): Promise<void> {
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error("User not found");
    }
    if (user.emailVerifiedAt) {
      return;
    }

    const { token, hash } = await this.generateOpaqueToken();
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationTokenHash: hash,
        emailVerificationTokenExpiresAt: expiresAt,
      },
    });

    const verifyUrl = `${this.getAppUrl()}/verify-email?token=${token}`;
    try {
      await getMailer().sendMail({
        to: user.email,
        subject: "Verify your Poker Champ email",
        text: `Welcome to Poker Champ! Verify your email here: ${verifyUrl}\n\nThis link expires in 24 hours.`,
      });
    } catch (err: unknown) {
      logger.error({ err, userId: user.id }, "Failed to send email verification email");
    }
  }

  /** Validates a raw email verification token and, if valid, marks the user's email verified. */
  static async verifyEmail(token: string): Promise<User> {
    const prisma = getPrisma();
    const matched = await this.findUserByOpaqueToken(token, "emailVerification");
    if (!matched) {
      throw new InvalidOrExpiredTokenError();
    }

    return prisma.user.update({
      where: { id: matched.id },
      data: {
        emailVerifiedAt: new Date(),
        emailVerificationTokenHash: null,
        emailVerificationTokenExpiresAt: null,
      },
    });
  }

  /**
   * Throws EmailNotVerifiedError if the given user has not verified their email. Intended for
   * a future gate on POST /api/economy/cash-out (not wired up here — EconomyRouter.ts is owned
   * by the cashier work); a caller there can `import { AuthService } from ".../AuthService.js"`
   * and call `AuthService.assertEmailVerified(req.user!)`.
   */
  // fallow-ignore-next-line unused-class-member
  static assertEmailVerified(user: Pick<User, "emailVerifiedAt">): void {
    if (!user.emailVerifiedAt) {
      throw new EmailNotVerifiedError();
    }
  }

  private static getAppUrl(): string {
    return process.env.APP_URL ?? "http://localhost:3000";
  }

  /** Generates a high-entropy opaque token plus a bcrypt hash of it, for reset/verification flows. */
  private static async generateOpaqueToken(): Promise<{ token: string; hash: string }> {
    const token = nanoid(48);
    const hash = await bcrypt.hash(token, TOKEN_HASH_SALT_ROUNDS);
    return { token, hash };
  }

  /**
   * Looks up the user whose stored token hash for `kind` matches the given raw token and
   * whose token has not expired. Tokens are bcrypt-hashed (like passwords), so — unlike a
   * deterministic hash — the hash can't be used as a direct lookup key; instead we compare
   * against the (small) set of users with a live, non-expired token of that kind.
   */
  private static async findUserByOpaqueToken(
    token: string,
    kind: "passwordReset" | "emailVerification",
  ): Promise<User | null> {
    if (!token || typeof token !== "string") return null;

    const prisma = getPrisma();
    const hashField = kind === "passwordReset" ? "passwordResetTokenHash" : "emailVerificationTokenHash";
    const expiresField = kind === "passwordReset" ? "passwordResetTokenExpiresAt" : "emailVerificationTokenExpiresAt";

    const candidates = await prisma.user.findMany({
      where: {
        [hashField]: { not: null },
        [expiresField]: { gt: new Date() },
      },
    });

    for (const candidate of candidates) {
      const storedHash = (candidate as unknown as Record<string, string | null>)[hashField];
      if (storedHash && (await bcrypt.compare(token, storedHash))) {
        return candidate;
      }
    }

    return null;
  }

  private static async createSession(userId: string): Promise<string> {
    const prisma = getPrisma();
    const token = nanoid(32);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.getSessionTtlMs());

    await prisma.userSession.create({
      data: {
        id: token,
        userId,
        createdAt: now,
        lastUsedAt: now,
        expiresAt,
      },
    });

    return token;
  }

  private static normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private static normalizeUsername(raw: string): string {
    const cleaned = raw
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^A-Za-z0-9_]/g, "")
      .toLowerCase();
    return cleaned.slice(0, MAX_USERNAME_LEN);
  }

  private static fallbackUsernameFromEmail(email: string): string {
    const prefix = email.split("@")[0] ?? "player";
    const normalized = this.normalizeUsername(prefix);
    if (normalized.length >= MIN_USERNAME_LEN) return normalized;
    return "player";
  }

  private static async allocateUsername(email: string, usernameInput?: string) {
    const prisma = getPrisma();
    const requested = typeof usernameInput === "string" ? this.normalizeUsername(usernameInput) : "";
    const base = requested || this.fallbackUsernameFromEmail(email);

    if (requested) {
      if (requested.length < MIN_USERNAME_LEN) {
        throw new Error(`Username must be at least ${MIN_USERNAME_LEN} characters`);
      }
      const existing = await prisma.user.findFirst({ where: { usernameNormalized: requested } });
      if (existing) {
        throw new Error("Username already taken");
      }
      return { username: requested, usernameNormalized: requested };
    }

    for (let attempt = 0; attempt < 50; attempt++) {
      const suffix = attempt === 0 ? "" : `_${nanoid(4).toLowerCase()}`;
      const candidate = `${base}${suffix}`.slice(0, MAX_USERNAME_LEN);
      const normalized = this.normalizeUsername(candidate);
      if (normalized.length < MIN_USERNAME_LEN) continue;

      const existing = await prisma.user.findFirst({ where: { usernameNormalized: normalized } });
      if (!existing) {
        return { username: normalized, usernameNormalized: normalized };
      }
    }

    throw new Error("Could not allocate username");
  }

  private static async ensureUserHandle(user: User): Promise<User> {
    if (user.username && user.usernameNormalized) return user;

    const prisma = getPrisma();
    const handle = await this.allocateUsername(user.email, user.username ?? undefined);
    return prisma.user.update({
      where: { id: user.id },
      data: {
        username: handle.username,
        usernameNormalized: handle.usernameNormalized,
      },
    });
  }

  private static getSessionTtlMs() {
    const parsed = Number.parseInt(process.env.SESSION_TTL_DAYS ?? "", 10);
    const days = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SESSION_TTL_DAYS;
    return days * 24 * 60 * 60 * 1000;
  }
}


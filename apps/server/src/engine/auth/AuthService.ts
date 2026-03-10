import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import { User } from "@prisma/client";
import { getPrisma } from "@poker-champ/db";
import { logger } from "../../lib/logger.js";

type AuthToken = string;
const DEFAULT_SESSION_TTL_DAYS = 14;
const MIN_USERNAME_LEN = 3;
const MAX_USERNAME_LEN = 24;
const STARTING_BANKROLL_CENTS = 1_000_000;

class AuthBackendUnavailableError extends Error {
  readonly code = "AUTH_BACKEND_UNAVAILABLE";
  constructor() {
    super("Auth backend unavailable");
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


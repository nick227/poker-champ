import type { User } from "@prisma/client";

const SENSITIVE_FIELDS = [
  "passwordHash",
  "passwordResetTokenHash",
  "passwordResetTokenExpiresAt",
  "emailVerificationTokenHash",
  "emailVerificationTokenExpiresAt",
] as const;

export type PublicUser = Omit<User, (typeof SENSITIVE_FIELDS)[number]>;

export function toPublicUser(user: User): PublicUser {
  const {
    passwordHash,
    passwordResetTokenHash,
    passwordResetTokenExpiresAt,
    emailVerificationTokenHash,
    emailVerificationTokenExpiresAt,
    ...publicUser
  } = user;
  void passwordHash;
  void passwordResetTokenHash;
  void passwordResetTokenExpiresAt;
  void emailVerificationTokenHash;
  void emailVerificationTokenExpiresAt;
  return publicUser;
}

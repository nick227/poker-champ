-- AlterTable
-- Adds password-reset and email-verification token support to User.
-- Only the token *hash* is stored (see AuthService.ts) — never the raw token.
ALTER TABLE `User` ADD COLUMN `emailVerificationTokenExpiresAt` DATETIME(3) NULL,
    ADD COLUMN `emailVerificationTokenHash` VARCHAR(191) NULL,
    ADD COLUMN `emailVerifiedAt` DATETIME(3) NULL,
    ADD COLUMN `passwordResetTokenExpiresAt` DATETIME(3) NULL,
    ADD COLUMN `passwordResetTokenHash` VARCHAR(191) NULL;

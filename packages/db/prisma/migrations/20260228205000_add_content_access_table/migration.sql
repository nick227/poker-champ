-- Backfill missing table that later migrations depend on.
CREATE TABLE IF NOT EXISTS `ContentAccess` (
    `id` VARCHAR(191) NOT NULL,
    `contentId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `isPremium` BOOLEAN NOT NULL DEFAULT false,
    `requiredTier` VARCHAR(191) NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

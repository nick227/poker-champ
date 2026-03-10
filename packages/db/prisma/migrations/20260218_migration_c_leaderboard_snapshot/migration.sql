-- Migration C: leaderboard snapshot materialization

CREATE TABLE `LeaderboardSnapshot` (
  `id` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  `period` VARCHAR(191) NOT NULL,
  `category` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `userDisplayName` VARCHAR(191) NOT NULL,

  `value` VARCHAR(191) NOT NULL,
  `valueNumerator` INT NOT NULL,
  `valueDenominator` INT NULL,
  `handCount` INT NOT NULL DEFAULT 0,
  `rank` INT NOT NULL,
  `computedAt` DATETIME(3) NOT NULL,

  INDEX `LeaderboardSnapshot_period_category_computedAt_rank_idx`(`period`, `category`, `computedAt`, `rank`),
  INDEX `LeaderboardSnapshot_period_category_computedAt_idx`(`period`, `category`, `computedAt`),
  INDEX `LeaderboardSnapshot_userId_computedAt_idx`(`userId`, `computedAt`),
  UNIQUE INDEX `LeaderboardSnapshot_period_category_computedAt_rank_key`(`period`, `category`, `computedAt`, `rank`),
  UNIQUE INDEX `LeaderboardSnapshot_period_category_computedAt_userId_key`(`period`, `category`, `computedAt`, `userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `LeaderboardSnapshot`
  ADD CONSTRAINT `LeaderboardSnapshot_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

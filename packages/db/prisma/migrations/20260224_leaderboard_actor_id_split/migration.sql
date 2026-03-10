-- Add actorId (stable identity for users and bots); make userId nullable FK for users only.
ALTER TABLE `LeaderboardSnapshot` ADD COLUMN `actorId` VARCHAR(191) NULL;

UPDATE `LeaderboardSnapshot` SET `actorId` = `userId`;

ALTER TABLE `LeaderboardSnapshot` MODIFY COLUMN `actorId` VARCHAR(191) NOT NULL;
ALTER TABLE `LeaderboardSnapshot` MODIFY COLUMN `userId` VARCHAR(191) NULL;

-- Clear userId where it is a bot identity or not a valid User.id (FK will be re-added).
UPDATE `LeaderboardSnapshot` SET `userId` = NULL WHERE `actorId` LIKE 'bot:%';
UPDATE `LeaderboardSnapshot` s LEFT JOIN `User` u ON s.`userId` = u.`id` SET s.`userId` = NULL WHERE u.`id` IS NULL AND s.`userId` IS NOT NULL;

DROP INDEX `LeaderboardSnapshot_period_category_computedAt_userId_key` ON `LeaderboardSnapshot`;
CREATE UNIQUE INDEX `LeaderboardSnapshot_period_category_computedAt_actorId_key` ON `LeaderboardSnapshot`(`period`, `category`, `computedAt`, `actorId`);

CREATE INDEX `LeaderboardSnapshot_actorId_computedAt_idx` ON `LeaderboardSnapshot`(`actorId`, `computedAt`);

ALTER TABLE `LeaderboardSnapshot`
  ADD CONSTRAINT `LeaderboardSnapshot_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

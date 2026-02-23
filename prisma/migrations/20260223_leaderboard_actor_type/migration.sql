-- Add actorType for human-only / bot-only leaderboard filters.
ALTER TABLE `LeaderboardSnapshot` ADD COLUMN `actorType` VARCHAR(191) NULL;

UPDATE `LeaderboardSnapshot` SET `actorType` = CASE WHEN `actorId` LIKE 'bot:%' THEN 'BOT' ELSE 'USER' END;

ALTER TABLE `LeaderboardSnapshot` MODIFY COLUMN `actorType` VARCHAR(191) NOT NULL;

CREATE INDEX `LeaderboardSnapshot_actorType_idx` ON `LeaderboardSnapshot`(`actorType`);

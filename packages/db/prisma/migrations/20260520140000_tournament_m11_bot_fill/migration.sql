-- AlterTable
ALTER TABLE `Tournament` ADD COLUMN `fillBotsAtStart` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `Tournament` ADD COLUMN `fillBotCount` INTEGER NULL;

-- AlterTable
ALTER TABLE `TournamentRegistration` ADD COLUMN `isBot` BOOLEAN NOT NULL DEFAULT false;

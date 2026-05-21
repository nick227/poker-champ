-- AlterTable
ALTER TABLE `Tournament`
    ADD COLUMN `maxPlayers` INTEGER NOT NULL DEFAULT 9,
    ADD COLUMN `startingStackCents` INTEGER NOT NULL DEFAULT 10000,
    ADD COLUMN `blindStructureId` VARCHAR(191) NOT NULL DEFAULT 'standard_8min',
    ADD COLUMN `lateRegMinutes` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `currentLevel` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `nextLevelAt` DATETIME(3) NULL,
    ADD COLUMN `tableId` VARCHAR(191) NULL,
    ADD COLUMN `roomId` VARCHAR(191) NULL,
    ADD COLUMN `finishedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `TournamentRegistration`
    ADD COLUMN `finishPlace` INTEGER NULL,
    ADD COLUMN `eliminatedAt` DATETIME(3) NULL;

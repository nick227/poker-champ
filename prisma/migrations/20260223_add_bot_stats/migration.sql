-- CreateTable
CREATE TABLE `BotStats` (
    `botId` VARCHAR(191) NOT NULL,
    `handsPlayed` INTEGER NOT NULL DEFAULT 0,
    `netCents` BIGINT NOT NULL DEFAULT 0,
    `grossWonCents` BIGINT NOT NULL DEFAULT 0,
    `grossLostCents` BIGINT NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`botId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

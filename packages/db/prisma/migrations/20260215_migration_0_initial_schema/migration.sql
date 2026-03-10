-- CreateTable
CREATE TABLE `PokerTable` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `name` VARCHAR(191) NOT NULL DEFAULT 'POC Table',
    `maxSeats` INTEGER NOT NULL DEFAULT 9,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PokerPlayer` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `tableId` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NOT NULL DEFAULT 'Player',
    `seat` INTEGER NOT NULL,
    `userId` VARCHAR(191) NULL,

    UNIQUE INDEX `PokerPlayer_tableId_seat_key`(`tableId`, `seat`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlayerBalance` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `tableId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `balanceCents` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `PlayerBalance_tableId_userId_key`(`tableId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BalanceTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tableId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tournamentId` VARCHAR(191) NULL,
    `handId` VARCHAR(191) NULL,
    `amountCents` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `externalRef` VARCHAR(191) NULL,
    `metaJson` JSON NULL,

    UNIQUE INDEX `BalanceTransaction_externalRef_key`(`externalRef`),
    INDEX `BalanceTransaction_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `BalanceTransaction_tableId_userId_idx`(`tableId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Hand` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endedAt` DATETIME(3) NULL,
    `tableId` VARCHAR(191) NOT NULL,
    `dealerSeat` INTEGER NOT NULL,
    `smallBlindCents` INTEGER NOT NULL,
    `bigBlindCents` INTEGER NOT NULL,
    `reason` VARCHAR(191) NULL,
    `boardJson` JSON NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HandPlayer` (
    `id` VARCHAR(191) NOT NULL,
    `handId` VARCHAR(191) NOT NULL,
    `playerId` VARCHAR(191) NOT NULL,
    `seat` INTEGER NOT NULL,
    `startingStackCents` INTEGER NOT NULL,
    `endingStackCents` INTEGER NULL,
    `holeCardsJson` JSON NULL,

    INDEX `HandPlayer_handId_seat_idx`(`handId`, `seat`),
    UNIQUE INDEX `HandPlayer_handId_playerId_key`(`handId`, `playerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HandAction` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `handId` VARCHAR(191) NOT NULL,
    `playerId` VARCHAR(191) NOT NULL,
    `seat` INTEGER NOT NULL,
    `street` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `amountCents` INTEGER NOT NULL DEFAULT 0,
    `potBeforeCents` INTEGER NOT NULL DEFAULT 0,
    `potAfterCents` INTEGER NOT NULL DEFAULT 0,
    `metaJson` JSON NULL,

    INDEX `HandAction_handId_createdAt_idx`(`handId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HandPayout` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `handId` VARCHAR(191) NOT NULL,
    `playerId` VARCHAR(191) NOT NULL,
    `amountCents` INTEGER NOT NULL,

    INDEX `HandPayout_handId_idx`(`handId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NULL,
    `usernameNormalized` VARCHAR(191) NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NOT NULL,
    `role` ENUM('USER', 'MODERATOR', 'ADMIN') NOT NULL DEFAULT 'USER',
    `isBanned` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `trustLevel` INTEGER NOT NULL DEFAULT 1,
    `bankrollCents` INTEGER NOT NULL DEFAULT 1000000,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_username_key`(`username`),
    UNIQUE INDEX `User_usernameNormalized_key`(`usernameNormalized`),
    INDEX `User_usernameNormalized_idx`(`usernameNormalized`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Tournament` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'REGISTERING',
    `entryFeeCents` INTEGER NOT NULL,
    `prizePoolCents` INTEGER NOT NULL DEFAULT 0,
    `startTime` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TournamentRegistration` (
    `tournamentId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `entryTxId` VARCHAR(191) NULL,

    UNIQUE INDEX `TournamentRegistration_tournamentId_userId_key`(`tournamentId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserSession` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastUsedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NOT NULL,

    INDEX `UserSession_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TableSeatSession` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `tableId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `seat` INTEGER NOT NULL,
    `state` ENUM('SEATED_ACTIVE', 'SEATED_SITTING_OUT', 'LEFT') NOT NULL DEFAULT 'SEATED_ACTIVE',
    `stackCentsSnapshot` INTEGER NOT NULL DEFAULT 0,
    `buyInCents` INTEGER NOT NULL DEFAULT 0,
    `handIdSnapshot` VARCHAR(191) NULL,
    `disconnectAt` DATETIME(3) NULL,
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reservedUntil` DATETIME(3) NULL,
    `schemaVersion` INTEGER NOT NULL DEFAULT 1,

    INDEX `TableSeatSession_tableId_idx`(`tableId`),
    INDEX `TableSeatSession_tableId_state_idx`(`tableId`, `state`),
    UNIQUE INDEX `TableSeatSession_tableId_userId_key`(`tableId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PokerPlayer` ADD CONSTRAINT `PokerPlayer_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `PokerTable`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PokerPlayer` ADD CONSTRAINT `PokerPlayer_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlayerBalance` ADD CONSTRAINT `PlayerBalance_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `PokerTable`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlayerBalance` ADD CONSTRAINT `PlayerBalance_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BalanceTransaction` ADD CONSTRAINT `BalanceTransaction_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `PokerTable`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BalanceTransaction` ADD CONSTRAINT `BalanceTransaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BalanceTransaction` ADD CONSTRAINT `BalanceTransaction_tournamentId_fkey` FOREIGN KEY (`tournamentId`) REFERENCES `Tournament`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BalanceTransaction` ADD CONSTRAINT `BalanceTransaction_handId_fkey` FOREIGN KEY (`handId`) REFERENCES `Hand`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Hand` ADD CONSTRAINT `Hand_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `PokerTable`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HandPlayer` ADD CONSTRAINT `HandPlayer_handId_fkey` FOREIGN KEY (`handId`) REFERENCES `Hand`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HandPlayer` ADD CONSTRAINT `HandPlayer_playerId_fkey` FOREIGN KEY (`playerId`) REFERENCES `PokerPlayer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HandAction` ADD CONSTRAINT `HandAction_handId_fkey` FOREIGN KEY (`handId`) REFERENCES `Hand`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HandAction` ADD CONSTRAINT `HandAction_playerId_fkey` FOREIGN KEY (`playerId`) REFERENCES `PokerPlayer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HandPayout` ADD CONSTRAINT `HandPayout_handId_fkey` FOREIGN KEY (`handId`) REFERENCES `Hand`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HandPayout` ADD CONSTRAINT `HandPayout_playerId_fkey` FOREIGN KEY (`playerId`) REFERENCES `PokerPlayer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TournamentRegistration` ADD CONSTRAINT `TournamentRegistration_tournamentId_fkey` FOREIGN KEY (`tournamentId`) REFERENCES `Tournament`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TournamentRegistration` ADD CONSTRAINT `TournamentRegistration_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserSession` ADD CONSTRAINT `UserSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;




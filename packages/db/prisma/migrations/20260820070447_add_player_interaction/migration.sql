-- CreateTable
CREATE TABLE `PlayerInteraction` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('GIFT', 'SIDE_BET') NOT NULL,
    `status` ENUM('PENDING', 'ACTIVE', 'COMPLETED', 'DECLINED', 'CANCELLED', 'EXPIRED', 'VOIDED') NOT NULL DEFAULT 'PENDING',
    `catalogKey` VARCHAR(191) NOT NULL,
    `tableId` VARCHAR(191) NOT NULL,
    `handId` VARCHAR(191) NULL,
    `initiatorId` VARCHAR(191) NOT NULL,
    `recipientId` VARCHAR(191) NOT NULL,
    `stakeCents` INTEGER NOT NULL DEFAULT 0,
    `payoutCents` INTEGER NULL,
    `winnerId` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `externalRef` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `respondedAt` DATETIME(3) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,

    UNIQUE INDEX `PlayerInteraction_externalRef_key`(`externalRef`),
    INDEX `PlayerInteraction_tableId_status_idx`(`tableId`, `status`),
    INDEX `PlayerInteraction_recipientId_status_idx`(`recipientId`, `status`),
    INDEX `PlayerInteraction_handId_idx`(`handId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PlayerInteraction` ADD CONSTRAINT `PlayerInteraction_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `PokerTable`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlayerInteraction` ADD CONSTRAINT `PlayerInteraction_handId_fkey` FOREIGN KEY (`handId`) REFERENCES `Hand`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlayerInteraction` ADD CONSTRAINT `PlayerInteraction_initiatorId_fkey` FOREIGN KEY (`initiatorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlayerInteraction` ADD CONSTRAINT `PlayerInteraction_recipientId_fkey` FOREIGN KEY (`recipientId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

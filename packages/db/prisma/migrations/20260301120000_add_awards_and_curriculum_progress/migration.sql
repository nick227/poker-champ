-- CreateTable
CREATE TABLE `UserAward` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `awardId` VARCHAR(191) NOT NULL,
    `catalogVersion` INTEGER NOT NULL DEFAULT 1,
    `earnedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastEarnedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `count` INTEGER NOT NULL DEFAULT 1,
    `reason` TEXT NOT NULL,
    `contextType` VARCHAR(191) NULL,
    `contextId` VARCHAR(191) NULL,
    `contextJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserAward_userId_awardId_key`(`userId`, `awardId`),
    INDEX `UserAward_userId_lastEarnedAt_idx`(`userId`, `lastEarnedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AwardGrantEvent` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `awardId` VARCHAR(191) NOT NULL,
    `triggerKey` VARCHAR(191) NOT NULL,
    `earnedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AwardGrantEvent_userId_awardId_triggerKey_key`(`userId`, `awardId`, `triggerKey`),
    INDEX `AwardGrantEvent_userId_awardId_triggerKey_idx`(`userId`, `awardId`, `triggerKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserCurriculumProgress` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `completedLessonsCount` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserCurriculumProgress_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserAward` ADD CONSTRAINT `UserAward_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserCurriculumProgress` ADD CONSTRAINT `UserCurriculumProgress_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

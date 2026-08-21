-- Drills lesson type: lesson-level format switch + ephemeral, server-authoritative drill sessions.
-- AlterTable
ALTER TABLE `Lesson`
  ADD COLUMN `format` VARCHAR(191) NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN `drillConfigJson` JSON NULL;

-- CreateTable
CREATE TABLE `DrillSession` (
    `id` VARCHAR(191) NOT NULL,
    `lessonId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `questionsJson` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,

    INDEX `DrillSession_userId_lessonId_status_idx`(`userId`, `lessonId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `DrillSession` ADD CONSTRAINT `DrillSession_lessonId_fkey` FOREIGN KEY (`lessonId`) REFERENCES `Lesson`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DrillSession` ADD CONSTRAINT `DrillSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

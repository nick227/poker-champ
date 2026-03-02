-- CreateTable
CREATE TABLE `Lesson` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `difficulty` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `estimatedMinutes` INTEGER NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Lesson_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LessonStep` (
    `id` VARCHAR(191) NOT NULL,
    `lessonId` VARCHAR(191) NOT NULL,
    `sequence` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `snapshotVersion` INTEGER NULL,
    `snapshotJson` JSON NULL,
    `gradingVersion` INTEGER NOT NULL DEFAULT 1,
    `beforeMessage` VARCHAR(191) NULL,
    `questionText` VARCHAR(191) NULL,
    `followUpMessage` VARCHAR(191) NULL,
    `gradingSpecJson` JSON NULL,
    `explanationJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `LessonStep_lessonId_sequence_key`(`lessonId`, `sequence`),
    INDEX `LessonStep_lessonId_sequence_idx`(`lessonId`, `sequence`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LessonStepOption` (
    `id` VARCHAR(191) NOT NULL,
    `stepId` VARCHAR(191) NOT NULL,
    `optionKey` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `valueJson` JSON NULL,
    `displayOrder` INTEGER NOT NULL,
    `isCorrect` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `LessonStepOption_stepId_optionKey_key`(`stepId`, `optionKey`),
    INDEX `LessonStepOption_stepId_displayOrder_idx`(`stepId`, `displayOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LessonConcept` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `LessonConcept_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LessonStepConcept` (
    `stepId` VARCHAR(191) NOT NULL,
    `conceptId` VARCHAR(191) NOT NULL,
    `weight` DOUBLE NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LessonStepConcept_conceptId_idx`(`conceptId`),
    PRIMARY KEY (`stepId`, `conceptId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LessonAttempt` (
    `id` VARCHAR(191) NOT NULL,
    `lessonId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'IN_PROGRESS',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,
    `scorePct` DOUBLE NULL,
    `masteryDeltaJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LessonAttempt_lessonId_userId_status_idx`(`lessonId`, `userId`, `status`),
    INDEX `LessonAttempt_userId_completedAt_idx`(`userId`, `completedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LessonAttemptStep` (
    `id` VARCHAR(191) NOT NULL,
    `attemptId` VARCHAR(191) NOT NULL,
    `stepId` VARCHAR(191) NOT NULL,
    `submittedAnswerJson` JSON NOT NULL,
    `isCorrect` BOOLEAN NOT NULL,
    `feedbackJson` JSON NULL,
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `LessonAttemptStep_attemptId_stepId_key`(`attemptId`, `stepId`),
    INDEX `LessonAttemptStep_attemptId_submittedAt_idx`(`attemptId`, `submittedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserConceptMastery` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `conceptId` VARCHAR(191) NOT NULL,
    `masteryScore` DOUBLE NOT NULL DEFAULT 0,
    `confidence` DOUBLE NOT NULL DEFAULT 0,
    `lastUpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserConceptMastery_userId_conceptId_key`(`userId`, `conceptId`),
    INDEX `UserConceptMastery_conceptId_idx`(`conceptId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `LessonStep` ADD CONSTRAINT `LessonStep_lessonId_fkey` FOREIGN KEY (`lessonId`) REFERENCES `Lesson`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LessonStepOption` ADD CONSTRAINT `LessonStepOption_stepId_fkey` FOREIGN KEY (`stepId`) REFERENCES `LessonStep`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LessonStepConcept` ADD CONSTRAINT `LessonStepConcept_stepId_fkey` FOREIGN KEY (`stepId`) REFERENCES `LessonStep`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LessonStepConcept` ADD CONSTRAINT `LessonStepConcept_conceptId_fkey` FOREIGN KEY (`conceptId`) REFERENCES `LessonConcept`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LessonAttempt` ADD CONSTRAINT `LessonAttempt_lessonId_fkey` FOREIGN KEY (`lessonId`) REFERENCES `Lesson`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LessonAttempt` ADD CONSTRAINT `LessonAttempt_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LessonAttemptStep` ADD CONSTRAINT `LessonAttemptStep_attemptId_fkey` FOREIGN KEY (`attemptId`) REFERENCES `LessonAttempt`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LessonAttemptStep` ADD CONSTRAINT `LessonAttemptStep_stepId_fkey` FOREIGN KEY (`stepId`) REFERENCES `LessonStep`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserConceptMastery` ADD CONSTRAINT `UserConceptMastery_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserConceptMastery` ADD CONSTRAINT `UserConceptMastery_conceptId_fkey` FOREIGN KEY (`conceptId`) REFERENCES `LessonConcept`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

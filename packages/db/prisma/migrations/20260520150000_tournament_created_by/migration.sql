-- AlterTable
ALTER TABLE `Tournament` ADD COLUMN `createdByUserId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Tournament_createdByUserId_idx` ON `Tournament`(`createdByUserId`);

-- AddForeignKey
ALTER TABLE `Tournament` ADD CONSTRAINT `Tournament_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `avatarUpdatedAt` DATETIME(3) NULL,
    ADD COLUMN `avatarUrl` VARCHAR(191) NULL,
    ADD COLUMN `avatarVersion` INTEGER NULL;

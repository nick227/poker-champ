/*
  Warnings:

  - A unique constraint covering the columns `[tableId,externalId]` on the table `PokerPlayer` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `externalId` to the `PokerPlayer` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX `PokerPlayer_tableId_seat_key` ON `pokerplayer`;

-- AlterTable
ALTER TABLE `pokerplayer` ADD COLUMN `externalId` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE INDEX `PokerPlayer_tableId_idx` ON `PokerPlayer`(`tableId`);

-- CreateIndex
CREATE UNIQUE INDEX `PokerPlayer_tableId_externalId_key` ON `PokerPlayer`(`tableId`, `externalId`);

-- RenameIndex
ALTER TABLE `pokerplayer` RENAME INDEX `PokerPlayer_userId_fkey` TO `PokerPlayer_userId_idx`;

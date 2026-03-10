-- AlterTable
ALTER TABLE `PokerTable`
  ADD COLUMN `creatorId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `PokerTable_creatorId_idx` ON `PokerTable`(`creatorId`);

-- AddForeignKey
ALTER TABLE `PokerTable`
  ADD CONSTRAINT `PokerTable_creatorId_fkey`
  FOREIGN KEY (`creatorId`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

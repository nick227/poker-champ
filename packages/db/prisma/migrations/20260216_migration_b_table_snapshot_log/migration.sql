-- Migration B: forensic table snapshot log

CREATE TABLE `TableSnapshotLog` (
  `id` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `tableId` VARCHAR(191) NOT NULL,
  `handId` VARCHAR(191) NULL,
  `snapshotId` VARCHAR(191) NOT NULL,
  `reason` ENUM(
    'HAND_START',
    'ACTION_ACCEPTED',
    'STREET_TRANSITION',
    'POT_UPDATED',
    'SHOWDOWN',
    'HAND_END',
    'PLAYER_JOIN',
    'PLAYER_LEAVE'
  ) NOT NULL,
  `street` VARCHAR(191) NOT NULL,
  `payloadJson` JSON NOT NULL,
  `payloadBytes` INT NOT NULL,
  `stateHash` VARCHAR(191) NOT NULL,
  `schemaVersion` INT NOT NULL DEFAULT 1,

  UNIQUE INDEX `TableSnapshotLog_snapshotId_key`(`snapshotId`),
  INDEX `TableSnapshotLog_tableId_createdAt_idx`(`tableId`, `createdAt`),
  INDEX `TableSnapshotLog_tableId_handId_createdAt_idx`(`tableId`, `handId`, `createdAt`),
  INDEX `TableSnapshotLog_tableId_reason_createdAt_idx`(`tableId`, `reason`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TableSnapshotLog`
  ADD CONSTRAINT `TableSnapshotLog_tableId_fkey`
  FOREIGN KEY (`tableId`) REFERENCES `PokerTable`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TableSnapshotLog`
  ADD CONSTRAINT `TableSnapshotLog_handId_fkey`
  FOREIGN KEY (`handId`) REFERENCES `Hand`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

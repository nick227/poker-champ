-- Multi-table tournament (MTT) support, Phase 1.
-- Adds TournamentTable (one row per physical table a Tournament spans) and
-- TournamentRegistration.tournamentTableId. Additive only: Tournament.tableId/roomId are
-- untouched and remain deprecated convenience fields mirroring table #1.
-- See docs/proposals/MULTI_TABLE_TOURNAMENT_PROPOSAL.md.

-- AlterTable
ALTER TABLE `TournamentRegistration` ADD COLUMN `tournamentTableId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `TournamentTable` (
    `id` VARCHAR(191) NOT NULL,
    `tournamentId` VARCHAR(191) NOT NULL,
    `tableNumber` INTEGER NOT NULL,
    `tableId` VARCHAR(191) NULL,
    `roomId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedAt` DATETIME(3) NULL,

    INDEX `TournamentTable_tournamentId_status_idx`(`tournamentId`, `status`),
    UNIQUE INDEX `TournamentTable_tournamentId_tableNumber_key`(`tournamentId`, `tableNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `TournamentRegistration_tournamentTableId_idx` ON `TournamentRegistration`(`tournamentTableId`);

-- AddForeignKey
ALTER TABLE `TournamentTable` ADD CONSTRAINT `TournamentTable_tournamentId_fkey` FOREIGN KEY (`tournamentId`) REFERENCES `Tournament`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TournamentRegistration` ADD CONSTRAINT `TournamentRegistration_tournamentTableId_fkey` FOREIGN KEY (`tournamentTableId`) REFERENCES `TournamentTable`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: one TournamentTable (tableNumber=1) per Tournament that already has a provisioned
-- table/room, so every currently-live or historical tournament lands in the new per-table model
-- with zero behavior change. Status mirrors the tournament's terminal-ness; closedAt mirrors
-- finishedAt for already-closed tournaments.
INSERT INTO `TournamentTable` (`id`, `tournamentId`, `tableNumber`, `tableId`, `roomId`, `status`, `createdAt`, `closedAt`)
SELECT
  CONCAT('ttbl_', t.`id`),
  t.`id`,
  1,
  t.`tableId`,
  t.`roomId`,
  CASE WHEN t.`status` IN ('FINISHED', 'ABANDONED', 'CANCELLED') THEN 'CLOSED' ELSE 'OPEN' END,
  t.`createdAt`,
  CASE WHEN t.`status` IN ('FINISHED', 'ABANDONED', 'CANCELLED') THEN t.`finishedAt` ELSE NULL END
FROM `Tournament` t
WHERE t.`tableId` IS NOT NULL OR t.`roomId` IS NOT NULL;

-- Point every non-finished registration on those tournaments at the new table #1 row.
UPDATE `TournamentRegistration` r
INNER JOIN `TournamentTable` tt ON tt.`tournamentId` = r.`tournamentId` AND tt.`tableNumber` = 1
SET r.`tournamentTableId` = tt.`id`
WHERE r.`finishPlace` IS NULL;

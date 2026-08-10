-- Hand-for-hand near the money bubble (MTT proposal, Phase 4).
-- Additive only: two boolean flags, both default false, no data migration needed.
-- See docs/proposals/MULTI_TABLE_TOURNAMENT_PROPOSAL.md.

-- AlterTable
ALTER TABLE `Tournament` ADD COLUMN `handForHandActive` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `TournamentTable` ADD COLUMN `handForHandReady` BOOLEAN NOT NULL DEFAULT false;

-- Migration A: deterministic ordering for authoritative hand history

ALTER TABLE `HandAction`
  ADD COLUMN `actionIndex` INT NULL;

UPDATE `HandAction` ha
JOIN (
  SELECT `id`, ROW_NUMBER() OVER (PARTITION BY `handId` ORDER BY `createdAt`, `id`) AS rn
  FROM `HandAction`
) seq ON seq.id = ha.id
SET ha.actionIndex = seq.rn;

ALTER TABLE `HandAction`
  MODIFY COLUMN `actionIndex` INT NOT NULL;

CREATE INDEX `HandAction_handId_actionIndex_idx` ON `HandAction`(`handId`, `actionIndex`);
CREATE UNIQUE INDEX `HandAction_handId_actionIndex_key` ON `HandAction`(`handId`, `actionIndex`);

ALTER TABLE `HandPayout`
  ADD COLUMN `payoutIndex` INT NULL;

UPDATE `HandPayout` hp
JOIN (
  SELECT `id`, ROW_NUMBER() OVER (PARTITION BY `handId` ORDER BY `createdAt`, `id`) AS rn
  FROM `HandPayout`
) seq ON seq.id = hp.id
SET hp.payoutIndex = seq.rn;

ALTER TABLE `HandPayout`
  MODIFY COLUMN `payoutIndex` INT NOT NULL;

CREATE INDEX `HandPayout_handId_payoutIndex_idx` ON `HandPayout`(`handId`, `payoutIndex`);
CREATE UNIQUE INDEX `HandPayout_handId_payoutIndex_key` ON `HandPayout`(`handId`, `payoutIndex`);

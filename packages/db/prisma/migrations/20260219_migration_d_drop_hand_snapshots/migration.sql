-- Migration D: remove legacy hand-level snapshot blob storage (no-op if column missing, e.g. shadow DB)
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Hand' AND COLUMN_NAME = 'snapshots') > 0,
  'ALTER TABLE `Hand` DROP COLUMN `snapshots`',
  'SELECT 1'
));
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- AlterTable (safe for case-sensitive MySQL table names)
SET @poker_table_name = (
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PokerTable'
    ) THEN 'PokerTable'
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pokertable'
    ) THEN 'pokertable'
    ELSE NULL
  END
);

SET @poker_alter_sql = IF(
  @poker_table_name IS NULL,
  'SELECT 1',
  CONCAT('ALTER TABLE `', @poker_table_name, '` ADD COLUMN `showStats` BOOLEAN NOT NULL DEFAULT true')
);

PREPARE poker_stmt FROM @poker_alter_sql;
EXECUTE poker_stmt;
DEALLOCATE PREPARE poker_stmt;

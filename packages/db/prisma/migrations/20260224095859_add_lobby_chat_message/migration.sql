-- AlterTable (safe no-op when table does not exist yet in migration order)
SET @lobby_table_name = (
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'LobbyChatMessage'
    ) THEN 'LobbyChatMessage'
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lobbychatmessage'
    ) THEN 'lobbychatmessage'
    ELSE NULL
  END
);

SET @lobby_alter_sql = IF(
  @lobby_table_name IS NULL,
  'SELECT 1',
  CONCAT('ALTER TABLE `', @lobby_table_name, '` MODIFY `text` VARCHAR(191) NOT NULL')
);

PREPARE lobby_stmt FROM @lobby_alter_sql;
EXECUTE lobby_stmt;
DEALLOCATE PREPARE lobby_stmt;

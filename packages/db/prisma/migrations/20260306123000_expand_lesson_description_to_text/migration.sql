-- Expand lesson description to TEXT to avoid VARCHAR(191) truncation failures during content seeding.
ALTER TABLE `Lesson`
  MODIFY COLUMN `description` TEXT NULL;

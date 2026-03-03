-- Canonical curriculum metadata on Lesson
ALTER TABLE `Lesson`
  ADD COLUMN `moduleCode` VARCHAR(191) NOT NULL DEFAULT 'MODULE_A',
  ADD COLUMN `recommendedOrder` INTEGER NOT NULL DEFAULT 999,
  ADD COLUMN `role` VARCHAR(191) NOT NULL DEFAULT 'teaches',
  ADD COLUMN `repeatable` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `curriculumVersion` VARCHAR(191) NULL;

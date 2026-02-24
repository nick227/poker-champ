CREATE TABLE `LobbyChatMessage` (
  `id` VARCHAR(191) NOT NULL,
  `scope` VARCHAR(191) NOT NULL DEFAULT 'lobby',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `senderUserId` VARCHAR(191) NOT NULL,
  `senderName` VARCHAR(191) NOT NULL,
  `text` TEXT NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `LobbyChatMessage_scope_createdAt_id_idx`
  ON `LobbyChatMessage` (`scope`, `createdAt`, `id`);

CREATE INDEX `LobbyChatMessage_scope_senderUserId_createdAt_idx`
  ON `LobbyChatMessage` (`scope`, `senderUserId`, `createdAt`);


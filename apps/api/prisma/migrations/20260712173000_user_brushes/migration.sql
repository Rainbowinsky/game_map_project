CREATE TABLE `UserBrush` (
  `id` CHAR(36) NOT NULL,
  `ownerId` CHAR(36) NOT NULL,
  `name` VARCHAR(60) NOT NULL,
  `color` CHAR(7) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `UserBrush_ownerId_name_key` (`ownerId`, `name`),
  INDEX `UserBrush_ownerId_createdAt_idx` (`ownerId`, `createdAt`),
  CONSTRAINT `UserBrush_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

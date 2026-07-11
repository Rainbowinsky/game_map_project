-- CreateTable
CREATE TABLE `User` (
    `id` CHAR(36) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `displayName` VARCHAR(100) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Project` (
    `id` CHAR(36) NOT NULL,
    `ownerId` CHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Project_ownerId_updatedAt_idx`(`ownerId`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Map` (
    `id` CHAR(36) NOT NULL,
    `projectId` CHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Map_projectId_updatedAt_idx`(`projectId`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MapDocument` (
    `id` CHAR(36) NOT NULL,
    `mapId` CHAR(36) NOT NULL,
    `schemaVersion` INTEGER NOT NULL DEFAULT 1,
    `width` INTEGER NOT NULL,
    `height` INTEGER NOT NULL,
    `themeId` VARCHAR(100) NOT NULL,
    `background` JSON NOT NULL,
    `settings` JSON NOT NULL,
    `revision` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MapDocument_mapId_key`(`mapId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MapLayer` (
    `id` CHAR(36) NOT NULL,
    `mapId` CHAR(36) NOT NULL,
    `parentId` CHAR(36) NULL,
    `name` VARCHAR(120) NOT NULL,
    `type` VARCHAR(32) NOT NULL,
    `sortOrder` INTEGER NOT NULL,
    `visible` BOOLEAN NOT NULL DEFAULT true,
    `locked` BOOLEAN NOT NULL DEFAULT false,
    `opacity` DOUBLE NOT NULL DEFAULT 1,
    `blendMode` VARCHAR(24) NOT NULL DEFAULT 'normal',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MapLayer_mapId_parentId_sortOrder_idx`(`mapId`, `parentId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MapChunk` (
    `id` CHAR(36) NOT NULL,
    `mapId` CHAR(36) NOT NULL,
    `x` INTEGER NOT NULL,
    `y` INTEGER NOT NULL,
    `revision` INTEGER NOT NULL DEFAULT 0,
    `objectCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MapChunk_mapId_updatedAt_idx`(`mapId`, `updatedAt`),
    UNIQUE INDEX `MapChunk_mapId_x_y_key`(`mapId`, `x`, `y`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MapObject` (
    `id` CHAR(36) NOT NULL,
    `mapId` CHAR(36) NOT NULL,
    `layerId` CHAR(36) NOT NULL,
    `chunkId` CHAR(36) NOT NULL,
    `type` VARCHAR(32) NOT NULL,
    `name` VARCHAR(120) NULL,
    `x` DOUBLE NOT NULL,
    `y` DOUBLE NOT NULL,
    `rotation` DOUBLE NOT NULL DEFAULT 0,
    `scaleX` DOUBLE NOT NULL DEFAULT 1,
    `scaleY` DOUBLE NOT NULL DEFAULT 1,
    `zIndex` INTEGER NOT NULL DEFAULT 0,
    `visible` BOOLEAN NOT NULL DEFAULT true,
    `locked` BOOLEAN NOT NULL DEFAULT false,
    `opacity` DOUBLE NOT NULL DEFAULT 1,
    `payload` JSON NOT NULL,
    `metadata` JSON NOT NULL,
    `revision` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MapObject_mapId_chunkId_layerId_idx`(`mapId`, `chunkId`, `layerId`),
    INDEX `MapObject_layerId_zIndex_idx`(`layerId`, `zIndex`),
    INDEX `MapObject_mapId_type_idx`(`mapId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Location` (
    `id` CHAR(36) NOT NULL,
    `mapId` CHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `x` DOUBLE NOT NULL,
    `y` DOUBLE NOT NULL,
    `summary` TEXT NULL,
    `description` LONGTEXT NULL,
    `regionId` CHAR(36) NULL,
    `iconAssetId` CHAR(36) NULL,
    `tags` JSON NOT NULL,
    `customFields` JSON NOT NULL,
    `minZoom` DOUBLE NULL,
    `maxZoom` DOUBLE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Location_mapId_type_idx`(`mapId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AssetCategory` (
    `id` CHAR(36) NOT NULL,
    `ownerId` CHAR(36) NULL,
    `name` VARCHAR(100) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AssetCategory_ownerId_name_idx`(`ownerId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Asset` (
    `id` CHAR(36) NOT NULL,
    `ownerId` CHAR(36) NULL,
    `categoryId` CHAR(36) NULL,
    `kind` ENUM('STAMP', 'TEXTURE', 'IMAGE', 'THUMBNAIL') NOT NULL,
    `displayName` VARCHAR(120) NOT NULL,
    `relativePath` VARCHAR(500) NOT NULL,
    `thumbnailPath` VARCHAR(500) NULL,
    `mimeType` VARCHAR(100) NOT NULL,
    `extension` VARCHAR(16) NOT NULL,
    `byteSize` BIGINT NOT NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `sha256` CHAR(64) NOT NULL,
    `metadata` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Asset_ownerId_kind_createdAt_idx`(`ownerId`, `kind`, `createdAt`),
    INDEX `Asset_sha256_idx`(`sha256`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MapVersion` (
    `id` CHAR(36) NOT NULL,
    `mapId` CHAR(36) NOT NULL,
    `number` INTEGER NOT NULL,
    `sourceRevision` INTEGER NOT NULL,
    `label` VARCHAR(120) NULL,
    `snapshotJson` JSON NULL,
    `snapshotPath` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MapVersion_mapId_createdAt_idx`(`mapId`, `createdAt`),
    UNIQUE INDEX `MapVersion_mapId_number_key`(`mapId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExportTask` (
    `id` CHAR(36) NOT NULL,
    `mapId` CHAR(36) NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELED') NOT NULL DEFAULT 'PENDING',
    `format` VARCHAR(16) NOT NULL,
    `options` JSON NOT NULL,
    `progress` INTEGER NOT NULL DEFAULT 0,
    `outputPath` VARCHAR(500) NULL,
    `errorCode` VARCHAR(64) NULL,
    `errorMessage` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ExportTask_mapId_status_createdAt_idx`(`mapId`, `status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OperationReceipt` (
    `id` CHAR(36) NOT NULL,
    `mapId` CHAR(36) NOT NULL,
    `clientMutationId` CHAR(36) NOT NULL,
    `previousRevision` INTEGER NOT NULL,
    `resultingRevision` INTEGER NOT NULL,
    `response` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OperationReceipt_createdAt_idx`(`createdAt`),
    UNIQUE INDEX `OperationReceipt_mapId_clientMutationId_key`(`mapId`, `clientMutationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Map` ADD CONSTRAINT `Map_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MapDocument` ADD CONSTRAINT `MapDocument_mapId_fkey` FOREIGN KEY (`mapId`) REFERENCES `Map`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MapLayer` ADD CONSTRAINT `MapLayer_mapId_fkey` FOREIGN KEY (`mapId`) REFERENCES `Map`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MapLayer` ADD CONSTRAINT `MapLayer_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `MapLayer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MapChunk` ADD CONSTRAINT `MapChunk_mapId_fkey` FOREIGN KEY (`mapId`) REFERENCES `Map`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MapObject` ADD CONSTRAINT `MapObject_mapId_fkey` FOREIGN KEY (`mapId`) REFERENCES `Map`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MapObject` ADD CONSTRAINT `MapObject_layerId_fkey` FOREIGN KEY (`layerId`) REFERENCES `MapLayer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MapObject` ADD CONSTRAINT `MapObject_chunkId_fkey` FOREIGN KEY (`chunkId`) REFERENCES `MapChunk`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Location` ADD CONSTRAINT `Location_mapId_fkey` FOREIGN KEY (`mapId`) REFERENCES `Map`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetCategory` ADD CONSTRAINT `AssetCategory_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Asset` ADD CONSTRAINT `Asset_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Asset` ADD CONSTRAINT `Asset_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `AssetCategory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MapVersion` ADD CONSTRAINT `MapVersion_mapId_fkey` FOREIGN KEY (`mapId`) REFERENCES `Map`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExportTask` ADD CONSTRAINT `ExportTask_mapId_fkey` FOREIGN KEY (`mapId`) REFERENCES `Map`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OperationReceipt` ADD CONSTRAINT `OperationReceipt_mapId_fkey` FOREIGN KEY (`mapId`) REFERENCES `Map`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

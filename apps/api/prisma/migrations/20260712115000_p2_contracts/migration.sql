-- P2-0: typed drawing contracts keep their payloads in MapObject JSON while
-- location/marker and asset relations become explicit database invariants.
ALTER TABLE `Location`
    ADD COLUMN `markerObjectId` CHAR(36) NULL,
    ADD UNIQUE INDEX `Location_markerObjectId_key`(`markerObjectId`),
    ADD INDEX `Location_mapId_name_idx`(`mapId`, `name`);

ALTER TABLE `Asset`
    ADD COLUMN `originalFileName` VARCHAR(255) NULL,
    ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD INDEX `Asset_ownerId_categoryId_createdAt_idx`(`ownerId`, `categoryId`, `createdAt`);

ALTER TABLE `Location`
    ADD CONSTRAINT `Location_iconAssetId_fkey`
    FOREIGN KEY (`iconAssetId`) REFERENCES `Asset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT `Location_markerObjectId_fkey`
    FOREIGN KEY (`markerObjectId`) REFERENCES `MapObject`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

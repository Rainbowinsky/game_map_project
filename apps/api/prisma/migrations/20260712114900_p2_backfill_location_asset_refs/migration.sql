-- P2-0 preflight: Location.iconAssetId existed before its foreign-key relation.
-- Preserve valid legacy references and null only orphaned IDs so the following
-- P2 contract migration can safely add the database constraint.
UPDATE `Location` AS `location`
LEFT JOIN `Asset` AS `asset` ON `asset`.`id` = `location`.`iconAssetId`
SET `location`.`iconAssetId` = NULL
WHERE `location`.`iconAssetId` IS NOT NULL
  AND `asset`.`id` IS NULL;

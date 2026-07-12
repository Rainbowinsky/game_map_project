-- P2-5: owner-scoped category names must stay unique under concurrent writes.
-- Keep AssetCategory_ownerId_name_idx: MySQL uses its ownerId prefix for the
-- AssetCategory_ownerId_fkey foreign-key constraint.
CREATE UNIQUE INDEX `AssetCategory_ownerId_name_key` ON `AssetCategory`(`ownerId`, `name`);

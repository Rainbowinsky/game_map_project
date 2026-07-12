# P2-0 契约冻结与写入内核实施报告

## 交付结论

P2-0 已完成第二阶段的向后兼容写入内核；本工作包不包含画布工具或新对象的 Pixi 投影。地图模型已从 schema v1 升级至 v2，旧图章地图仍可读取和写入，新的绘制对象、地点和素材引用只能通过严格校验后的 operation 批次写入。

本次改动保持以下边界不变：MySQL 是长期真源；`POST /maps/:mapId/operations` 是画布写入唯一入口；写入继续使用 revision 与 client mutation ID；客户端不传递存储路径。

## 完成内容

- 将 `MapObject` 扩展为严格判别联合：`stamp`、`terrain-stroke`、`path`、`region`、`text`、`marker`。
  - 地形笔刷限制点数、总长度和 JSON 字节数。
  - 路径要求至少两个不同锚点，并支持贝塞尔手柄数据。
  - 区域要求至少三个非共线顶点，拒绝重复顶点和自交多边形。
  - 文本限制长度、行数和字号，拒绝 HTML 标记字符。
  - marker 约束地点 ID、图标素材 ID 与显示缩放范围。
- 新增严格的 `Location`、Location 更新 DTO、主题 token/definition、路径节点和笔刷 schema，以及正反 fixtures。
- 新增 `1 → 2` 文档迁移。迁移只更新 `schemaVersion`，不改变原有图层、图章或背景数据；服务端读取 v1 文档时返回已迁移的 v2 文档。
- operation 请求现在只接受 schema v2；携带 schema v1 的写入请求返回 `MAP_SCHEMA_VERSION_UNSUPPORTED`（409），不会发生静默混写。
- `MapDocument`、`MapObject`、repository mapper 与 chunk 响应均已支持 v2 对象。首次写入 P2 对象或地点时，持久化文档版本升为 2；仅包含既有图章的 v2 operation 不会强制重写遗留文档版本。
- 新增 location/marker 原子关系校验：marker 所指地点、地点所属 region 和对象必须位于同一地图；一个地点最多拥有一个主 marker。
- 新增素材引用校验：图章、marker 图标与地点图标只能引用当前用户或内置且未软删除的素材。
- 新增 Prisma migration：
  - 在增加外键前，将历史 `Location.iconAssetId` 中不存在对应 Asset 的孤儿引用置空，保留有效引用；
  - `Location.markerObjectId` 的唯一外键关系；
  - `Location.iconAssetId → Asset` 关系；
  - `Asset.originalFileName`、`Asset.deletedAt`；
  - `Location(mapId, name)` 与 `Asset(ownerId, categoryId, createdAt)` 索引。
- 现有 P1 渲染器与 PNG exporter 显式只处理 `stamp` 对象，防止尚未实现 UI/投影的 P2 类型影响已交付画布行为。

## 关键文件

- `packages/map-model/src/objects.ts`：对象判别联合、几何和字节限制。
- `packages/map-model/src/locations.ts`：地点与地点更新契约。
- `packages/map-model/src/themes.ts`：只读主题定义与 token 契约，为 P2-1 注册表准备。
- `packages/map-model/src/migrations.ts`：v1 → v2 纯文档迁移。
- `packages/map-model/src/operations.ts`：对象类型白名单更新、地点 operation 与批次字节限制。
- `apps/api/prisma/migrations/20260712114900_p2_backfill_location_asset_refs/migration.sql`：存量地点图标引用预清理。
- `apps/api/prisma/migrations/20260712115000_p2_contracts/migration.sql`：P2-0 数据库关系和索引。
- `apps/api/src/maps/maps.service.ts`：事务预验证、跨引用检查、对象/地点持久化映射。
- `apps/api/test/maps.integration.test.ts`：遗留文档迁移、location/marker 原子性、跨地图与跨用户素材拒绝。

## 验收证据

| 验收项 | 自动化证据 |
| --- | --- |
| v1 文档可读取，既有图章可继续写入 | `migrations.test.ts`；`maps.integration.test.ts` 中的遗留地图读取与图章写入场景 |
| 非法几何、HTML 文本、空更新和超大 operation 被拒绝 | `objects.test.ts`、`locations.test.ts`、`operations.test.ts` |
| location/marker 原子性 | `maps.integration.test.ts` 同批创建 region、location 和 marker 场景 |
| 跨地图引用与他人素材引用被拒绝 | `maps.integration.test.ts` |
| Prisma 关系、审计字段和索引存在 | `apps/api/src/prisma/migration.test.ts` |
| P1 画布回归 | web 单元测试与 production build |

## 验证结果

本工作包已通过以下命令：

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

`test:integration` 使用迁移后的测试数据库，覆盖 11 项认证和地图 API 集成测试。P2-0 不含新的 UI 工具，因此不把 P2-2 之后的绘制、缩略图或素材上传端到端场景提前计入本包验收。

## 取舍与后续边界

- P2-0 只冻结主题定义契约；主题注册、编辑器/导出 token 注入属于 P2-1。
- P2-0 持久化路径、区域、地形、文本和 marker，但不创建它们的工具栏、命令交互或 Pixi 投影；这些分别由 P2-2、P2-3 和 P2-4 实现。
- `Asset.deletedAt` 与关系约束已落库；上传、缩略图、分类 API 和“有引用即拒绝”的删除接口属于 P2-5。
- 仍维持第一阶段的全量已加载对象边界；Chunk 流式加载、空间索引、LOD、Worker、多用户协作和分块高分辨率导出不属于本工作包。

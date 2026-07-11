# P4 项目、地图、图层、Chunk 与操作 API 实现报告

## 完成内容

- 新增项目 CRUD 与 cursor 分页，并在项目摘要中返回地图摘要。
- 新增地图创建事务：同时创建 `Map`、`MapDocument` 与默认的 `Landmarks` stamp 图层；任一步失败均由数据库事务回滚。
- 新增地图聚合读取接口，返回经过 `mapDocumentSchema` 校验的地图文档。
- 新增 Chunk descriptor 分页与按坐标读取完整 Chunk payload 接口。
- 新增图层创建、更新、重排与删除端点；所有端点都会转换为统一的 operation transaction。
- 新增 `POST /maps/:mapId/operations`，支持 object、layer 与 map metadata operation，包含 revision 乐观并发控制、mutation receipt 幂等、跨 Chunk 更新计数及层级规则校验。
- 所有路径都使用当前 `actorId` 的 owner-scoped 查询；越权访问与不存在资源统一返回 404。

## 关键设计

- operation 在可串行化的 Prisma 事务内执行。先检查 receipt，再检查 `baseRevision`，只有整个批次成功后才递增 revision 并写入 receipt。
- 图层重排要求完整且无重复的同级 ID 列表；图层 parent 必须是 group，禁止环、删除有子层的图层、删除 background 层和修改受锁定对象。
- 对象创建和替换 asset 时检查 asset 属于当前用户；对象移动、删除或图层删除会同步更新受影响 Chunk 的 `objectCount` 与 revision。
- P4 是 API 阶段，尚未引入编辑器 UI；简洁、高级感的视觉实现将在 P5 的 Web 编辑器壳阶段落地。

## 新增主要文件

- `apps/api/src/maps/`
- `apps/api/test/maps.integration.test.ts`
- `packages/validation/src/projects.ts`

## 验证

- `pnpm lint` 通过。
- `pnpm typecheck` 通过。
- `pnpm test` 通过（78 个单元测试）。
- `pnpm build` 通过。
- `pnpm --filter @fantasy-map/api test:integration` 通过（9 个 MySQL 集成测试），覆盖项目到地图到对象 operation 到 Chunk 读取的闭环、幂等重试、409 revision 冲突和跨用户隔离。

## 下一步

进入 P5：建立具有简洁高级视觉语言的 Web 编辑器壳、路由、Query 数据加载和 normalized store。

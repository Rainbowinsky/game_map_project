# P1 共享模型与数学内核实现报告

## 完成内容

- 以 strict Zod schema 落地基础值、地图文档、图层、stamp 对象、Chunk 与编辑操作契约，TypeScript 类型全部从 schema 推导。
- 实现世界/屏幕坐标往返、指针锚定缩放、滚轮缩放、整图适配、可见世界矩形与通用 clamp。
- 实现负坐标正确 floor 的 Chunk 坐标、key 往返、边界、矩形相交 Chunk 枚举。
- 建立 schemaVersion v1 迁移注册表；v1 进行完整重验证，未知、未来及倒退版本明确失败。
- 提供与应用状态无关的有效/无效文档、对象、Chunk 和 operation fixtures。
- 建立反例测试，覆盖未知字段、未来版本、非有限数、零缩放、坏颜色、层级环、超量 metadata 和受保护字段更新。

## 主要修改文件

- `packages/map-model/src/primitives.ts`
- `packages/map-model/src/document.ts`
- `packages/map-model/src/objects.ts`
- `packages/map-model/src/operations.ts`
- `packages/map-model/src/camera.ts`
- `packages/map-model/src/chunks.ts`
- `packages/map-model/src/migrations.ts`
- `packages/map-model/src/fixtures.ts`
- `packages/map-model/src/*.test.ts`

## 设计取舍

- 地图创建尺寸按第一阶段建议范围 `1_000..1_000_000` 强校验；一般坐标保留更大安全范围，世界尺寸不参与 Canvas 分配。
- 对象缩放保持正数，镜像由 `flipX/flipY` 表达，避免负缩放与镜像字段形成双重语义。
- 图层集合 schema 同时校验父层存在、同地图 group、无环、背景层数量和兄弟 order 连续性；数据库事务仍需在 P4 重复执行权威校验。
- metadata 限定为 JSON value 且不超过 16 KiB，防止任意对象或大内容绕过领域字段进入持久层。
- fixtures 通过独立 package subpath `@fantasy-map/map-model/fixtures` 暴露，不引用 Web/API 内部 store。

## 验证

- `pnpm --filter @fantasy-map/map-model typecheck`：通过。
- `pnpm --filter @fantasy-map/map-model test`：6 个测试文件、37 个测试通过。
- `pnpm lint`：通过，无 warning。
- `pnpm typecheck`：通过，Web/API/三个共享包 strict 无错误。
- `pnpm test`：通过，全仓 9 个测试文件、40 个测试通过。
- `pnpm build`：通过，Web/API/三个共享包生产构建成功。
- Node ESM 直接导入 `packages/map-model/dist/index.js`：通过；产物中无测试文件。

## 未完成内容

- Prisma schema、migration、数据库生命周期与 API 基础设施属于 P2。
- 认证、所有权、CRUD、编辑器状态、Pixi、Command、自动保存与导出仍按 P3-P12 顺序实施。
- 图层删除、跨 Chunk 移动和 revision 并发目前只有共享输入契约，服务端事务规则在 P4 落地。

## 下一步

进入 P2：建立 Prisma/MySQL 基础模型和迁移、Nest 全局输入验证/错误结构/request ID/日志脱敏、安全头与 `StorageProvider` 路径安全测试。

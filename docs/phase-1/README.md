# 第一阶段设计文档索引

状态：P0-P3 已完成；认证、当前用户与所有权隔离已通过本机 MySQL 和 CI 配置的集成测试。

本目录是“基础编辑器 MVP”的实施基线：

- [原始需求归档](../requirements/original-requirements.txt)：用户提供的完整原始需求文本，未经结构化改写。
- [architecture.md](./architecture.md)：范围、风险、系统边界、目录、前后端架构、PixiJS 场景树、相机、命令历史、保存和导出设计。
- [data-and-api.md](./data-and-api.md)：共享 TypeScript/Zod 模型、Prisma 数据模型、REST API 契约、错误与并发约定。
- [implementation-plan.md](./implementation-plan.md)：工作包、依赖、验证门禁、验收矩阵及明确延期项。
- [p1-implementation-report.md](./p1-implementation-report.md)：P1 完成内容、设计取舍、验证结果与下一步。
- [p4-implementation-report.md](./p4-implementation-report.md)：P4 API 闭环、事务规则、验证结果与下一步。
- [p2-implementation-report.md](./p2-implementation-report.md)：P2 数据库/API/存储基础设施、验证结果与数据库待办。
- [p3-implementation-report.md](./p3-implementation-report.md)：P3 密码、JWT、认证 Guard、限流和所有权隔离实现。

## 第一阶段范围

第一阶段交付一个单用户 Web 编辑器闭环：创建项目和地图、相机平移缩放、图层管理、原创图章放置与变换、多选、撤销重做、自动保存与刷新恢复、基础 PNG 导出。

第一阶段只建立扩展接口但不实现：地形绘制、路径编辑、地点资料、完整主题系统、视口 Chunk 流式加载、空间索引、LOD、Worker、分块高清导出、Redis/BullMQ、版本产品界面、公开地图、协作、MapLibre 和 Tauri。

## 核心约束

1. MySQL 是长期数据的真实来源；IndexedDB 只用于未提交变更的崩溃恢复。
2. 地图元数据、图层、Chunk 和对象分开持久化，不保存为单个持续膨胀的 JSON。
3. 世界坐标与画布像素分离，不按世界尺寸创建 Canvas 或纹理。
4. React 管理编辑器 UI；PixiJS 适配器拥有渲染循环和显示对象，`PIXI.Application` 不进入 Zustand。
5. 连续手势只产生一条历史记录和一批保存操作。
6. 服务端根据已认证用户检查每个项目、地图、图层、Chunk、对象和资源的所有权。
7. 所有跨边界数据使用 Zod 或 DTO 验证，TypeScript 开启 strict，禁止以 `any` 绕过模型。

## 设计冻结点

实现开始前，仅以下事项需要在工作包 P0 中确认，不阻塞当前架构：

- Node.js 与 pnpm 的具体 LTS/主版本写入根目录 `packageManager` 和 `engines`。
- MySQL 开发环境采用本机连接还是 Docker Compose；两者不改变 Prisma 模型。
- 第一套原创图章是仓库内 SVG 源文件运行时加载，还是构建时生成小型 atlas；架构同时支持二者。

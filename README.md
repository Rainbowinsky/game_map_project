# Fantasy Map Editor

面向小说作者、游戏策划、跑团主持人和世界观创作者的 Web 端 2D 世界地图编辑器。

当前状态：第一阶段 P0-P10 已完成。项目已具备认证与所有权隔离、项目/地图/图层/Chunk/操作 API、桌面编辑器、Pixi 相机与渲染、Command 撤销重做、图层编辑、原创图章的放置/多选/变换，以及自动保存和崩溃恢复闭环。

尚未完成：P11 PNG 导出、P12 性能安全收口。

## 已实现能力

- Argon2id 注册登录、短期 JWT、认证限流和 owner-scoped 资源隔离
- 项目、地图和图层 CRUD，Chunk 读取与 revision/幂等 operation 事务
- 地图加载、normalized store、错误重试与桌面工作台布局
- PixiJS Canvas 生命周期、适应地图、指针锚定缩放、中键/空格平移和动态网格
- Command execute/undo/redo、事务、历史合并、双内存上限和 PatchBus
- 图层新建、重命名、排序、显隐、锁定、透明度、混合模式、复制和删除策略
- 原创山峰、树木、城镇 SVG 图章，支持点击或 HTML5 拖放到画布；新图章会按当前 zoom 自动获得稳定、可操作的屏幕尺寸
- 点击选择、Shift 多选、框选、移动、共同 bounds 缩放、旋转、复制粘贴、删除和前后移
- Pixi 增量对象投影、共享 Texture 生命周期和视口外对象裁剪
- 800 ms 防抖、5 s 最大等待的串行自动保存，网络失败指数退避，409 进入冲突状态
- IndexedDB 先写日志、幂等 mutation 恢复、刷新恢复对话框、离开保护和多标签编辑提醒

## 环境要求

- Node.js 22.15+ 或 24.x；仓库与 CI 基线固定为 22.15.1（见 `.node-version` / `.nvmrc`）
- pnpm 11.7.x（通过 Corepack 管理）
- MySQL 8.0；当前开发机使用本机 `MySQL80` 服务，不依赖 Docker

```powershell
corepack enable
pnpm install --frozen-lockfile
Copy-Item .env.example .env
pnpm --filter @fantasy-map/api prisma:migrate:deploy
pnpm --filter @fantasy-map/api prisma:seed
pnpm dev
```

默认地址：Web `http://127.0.0.1:5173`，API 健康检查 `http://127.0.0.1:3000/api/v1/health`。API 启动时会验证环境并连接数据库；数据库不可用时明确失败。

从 P9 或更早版本升级时请重新执行 `pnpm --filter @fantasy-map/api prisma:seed`，以写入三枚 `ownerId = null` 的内置 SVG 图章记录；seed 使用 upsert，可安全重复执行。

## MySQL 开发数据库

本机没有 Docker，因此 P2 采用已安装的 MySQL 8.0。使用管理员账户进入 MySQL 后执行：

```sql
CREATE DATABASE fantasy_map CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'fantasy_map'@'localhost' IDENTIFIED BY '<replace-with-a-strong-password>';
GRANT ALL PRIVILEGES ON fantasy_map.* TO 'fantasy_map'@'localhost';

CREATE DATABASE fantasy_map_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'fantasy_map_test'@'localhost' IDENTIFIED BY '<replace-with-another-password>';
GRANT ALL PRIVILEGES ON fantasy_map_test.* TO 'fantasy_map_test'@'localhost';
FLUSH PRIVILEGES;
```

将真实连接串写入未提交的 `.env`；测试库名必须以 `_test` 结尾，清理工具会拒绝其他数据库。不要把真实密码写入 `.env.example`。

## 质量门禁

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm test:e2e
```

CI 使用 MySQL 8.0 独立测试库执行认证、所有权和地图操作集成测试。Playwright 已纳入门禁，覆盖项目/地图创建、编辑器恢复，以及图章放置、选择、变换、复制、删除和撤销主路径。浏览器缺失时先执行 `pnpm exec playwright install chromium`。

## 编辑器操作

- `V`：选择工具；点击对象，按住 Shift 增减多选，空白拖动框选
- `H`：平移工具；也可使用鼠标中键或按住 Space 拖动画布
- `S`：图章工具；先在左侧选择素材，再点击画布或将素材拖入画布
- 拖动选择框移动对象；拖动角点等比缩放；拖动顶部圆点旋转
- `Ctrl/Cmd+C`、`Ctrl/Cmd+V`、`Ctrl/Cmd+D`：复制、粘贴和快速副本
- `Delete/Backspace`：删除；`[` / `]`：后移/前移
- `Ctrl/Cmd+Z`、`Ctrl/Cmd+Shift+Z`：撤销和重做；`Esc`：取消当前变换手势

## 主要 API

- `POST /api/v1/auth/register`：注册并返回短期 access token
- `POST /api/v1/auth/login`：统一凭据错误，不区分邮箱不存在与密码错误
- `GET /api/v1/auth/me`：需要 `Authorization: Bearer <token>`

密码使用 Argon2id；JWT 固定 HS256、issuer、audience 和短期过期时间。除健康检查和注册登录外，API 默认需要认证。

- `/api/v1/projects`：项目列表与 CRUD
- `/api/v1/projects/:projectId/maps`：在项目内创建地图
- `/api/v1/maps/:mapId`：地图聚合文档
- `/api/v1/maps/:mapId/layers`：图层 CRUD 与排序
- `/api/v1/maps/:mapId/chunks`：占用 Chunk 描述和对象载荷
- `/api/v1/maps/:mapId/operations`：revision 约束、幂等、整批原子提交

## Workspace

- `apps/web`：React + Vite 编辑器、PixiJS 渲染适配器、Command 历史和 Playwright E2E
- `apps/api`：NestJS 认证、所有权、项目/地图/图层/Chunk/operation API
- `packages/map-model`：无框架依赖的 strict Zod 地图契约、相机/Chunk 纯函数、版本迁移和 fixtures
- `packages/validation`：Web/API 共用的 Zod 边界
- `packages/shared`：通用类型和安全共享工具入口

设计入口：

- [原始需求归档](./docs/requirements/original-requirements.txt)
- [第一阶段文档索引](./docs/phase-1/README.md)
- [架构设计](./docs/phase-1/architecture.md)
- [共享数据、Prisma 与 API 契约](./docs/phase-1/data-and-api.md)
- [实施计划与任务拆分](./docs/phase-1/implementation-plan.md)

阶段实现报告：

- [P1 共享模型与数学内核](./docs/phase-1/p1-implementation-report.md)
- [P2 Prisma、API 与存储基础设施](./docs/phase-1/p2-implementation-report.md)
- [P3 认证与所有权](./docs/phase-1/p3-implementation-report.md)
- [P4 项目、地图、图层、Chunk 与操作 API](./docs/phase-1/p4-implementation-report.md)
- [P5 Web 编辑器壳与数据加载](./docs/phase-1/p5-implementation-report.md)
- [P6 Pixi 生命周期与相机](./docs/phase-1/p6-implementation-report.md)
- [P7 Command 与历史内核](./docs/phase-1/p7-implementation-report.md)
- [P8 图层编辑闭环](./docs/phase-1/p8-implementation-report.md)
- [P9 图章、选择与变换](./docs/phase-1/p9-implementation-report.md)
- [P10 自动保存与崩溃恢复](./docs/phase-1/p10-implementation-report.md)

下一步按实施计划进入 P11：基础 PNG 导出。

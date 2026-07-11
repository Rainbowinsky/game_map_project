# Fantasy Map Editor

面向小说作者、游戏策划、跑团主持人和世界观创作者的 Web 端 2D 世界地图编辑器。

当前状态：第一阶段 P0（工具链与 workspace 骨架）和 P1（共享模型与数学内核）已经落地。仓库包含可构建的 React/Vite Web、NestJS API，以及 `map-model`、`validation`、`shared` 三个共享包；数据库业务、认证、编辑器页面和 Pixi 场景尚未开始。

## 环境要求

- Node.js 22.15+ 或 24.x；仓库与 CI 基线固定为 22.15.1（见 `.node-version` / `.nvmrc`）
- pnpm 11.7.x（通过 Corepack 管理）
- 后续 P2 起需要 MySQL；P0 不连接数据库

```powershell
corepack enable
pnpm install --frozen-lockfile
Copy-Item .env.example .env
pnpm dev
```

默认地址：Web `http://127.0.0.1:5173`，API 健康检查 `http://127.0.0.1:3000/api/health`。

## 质量门禁

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

P0 合并前必须通过前四项。Playwright 配置和 smoke 用例已建立，浏览器安装后可执行 `pnpm exec playwright install chromium` 再运行 E2E；根据实施计划，E2E 从 P5 起正式纳入必过门禁。

## Workspace

- `apps/web`：React + Vite 应用壳
- `apps/api`：NestJS API 与健康检查
- `packages/map-model`：无框架依赖的 strict Zod 地图契约、相机/Chunk 纯函数、版本迁移和 fixtures
- `packages/validation`：Web/API 共用的 Zod 边界
- `packages/shared`：通用类型和安全共享工具入口

设计入口：

- [原始需求归档](./docs/requirements/original-requirements.txt)
- [第一阶段文档索引](./docs/phase-1/README.md)
- [架构设计](./docs/phase-1/architecture.md)
- [共享数据、Prisma 与 API 契约](./docs/phase-1/data-and-api.md)
- [实施计划与任务拆分](./docs/phase-1/implementation-plan.md)

P1 实现详情见 [`docs/phase-1/p1-implementation-report.md`](./docs/phase-1/p1-implementation-report.md)。下一步按计划进入 P2：Prisma schema、初始迁移、API 错误/验证/日志基线与本地存储抽象。

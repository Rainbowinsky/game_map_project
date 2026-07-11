# Fantasy Map Editor

面向小说作者、游戏策划、跑团主持人和世界观创作者的 Web 端 2D 世界地图编辑器。

当前状态：第一阶段 P0（workspace）、P1（共享模型与数学内核）及 P2（Prisma 与 API 基础设施）代码已经落地。认证、业务 CRUD、编辑器页面和 Pixi 场景尚未开始。

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

实现详情见 [P1 报告](./docs/phase-1/p1-implementation-report.md)和 [P2 报告](./docs/phase-1/p2-implementation-report.md)。本机开发库与测试库的初始 migration 已验证，下一步按计划进入 P3：认证与所有权。

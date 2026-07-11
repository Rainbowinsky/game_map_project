# P2 Prisma 与 API 基础设施实现报告

## 完成内容

- 使用 Prisma 7.8 `prisma-client` generator 和 MariaDB/MySQL driver adapter 落地完整 P2 schema。
- 生成初始 MySQL migration，包含用户、项目、地图、文档、图层、Chunk、对象、资源、版本、导出和 operation receipt。
- 建立无生产口令的内置素材分类 seed。
- 建立 PrismaService 连接/断开生命周期、数据库健康检查和只允许 `_test` 数据库的清理策略。
- API 启动前严格验证环境变量；缺少数据库、JWT、CORS 等配置时失败，数据库不可用时返回安全错误。
- API 基地址调整为 `/api/v1`，成功响应统一为 `{ data, meta.requestId }`，错误统一为 `{ error }`。
- 加入 request ID、JSON 日志和 password/token/cookie/database URL 脱敏。
- 加入 Helmet、安全 CORS allowlist、请求体限制及全局限流基线。
- 实现 StorageProvider 与 LocalStorageProvider，只接受逻辑 key，拒绝绝对路径、反斜杠和路径穿越。

## 主要文件

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260711194000_initial/migration.sql`
- `apps/api/prisma/seed.ts`
- `apps/api/src/config/app-config.ts`
- `apps/api/src/prisma/prisma.service.ts`
- `apps/api/src/common/`
- `apps/api/src/storage/`
- `.env.example` 与 `.env.test.example`

## 设计取舍

- 当前机器已安装并运行 MySQL 8.0.39，但没有 Docker，因此采用本机 MySQL；Prisma schema 与 provider 不受未来容器化影响。
- Prisma Client 使用 7.x 要求的 driver adapter；生成代码不提交 Git，每次 build/typecheck/test 自动生成。
- Prisma 内部日志关闭，由应用结构化日志统一记录安全错误码，避免驱动错误意外泄漏连接串。
- 服务启动执行 `$connect`，数据库不可用时立即失败，不让 API 以半可用状态监听端口。
- 内置 seed 只创建 owner 为 null 的素材分类，不创建带默认密码的用户。
- 测试库清理以数据库名 `_test` 作为硬保护，防止误清开发库。

## 自动验证

- `prisma validate`：schema 合法。
- Prisma Client 7.8 生成成功。
- migration 结构测试覆盖主要表、外键、utf8mb4 collation 和连接串泄漏。
- API P2 测试覆盖环境反例、Prisma 生命周期、HTTP envelope、request ID、错误脱敏、Helmet、CORS、Zod 未知字段及路径穿越。
- `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 全部通过；全仓 65 个测试通过。

## 本机数据库验证

使用用户提供的管理员凭据完成了以下验证，管理员密码未写入仓库：

- 创建 `fantasy_map` 与 `fantasy_map_test` 两个 utf8mb4 数据库。
- 对两个空库分别成功应用 `20260711194000_initial` migration。
- 使用非 root、按库授权的本地开发/测试账户复核连接。
- 开发库 seed 成功且可幂等重复执行。
- API 使用非 root 开发账户启动并实测 `GET /api/v1/health`，返回 `database: ok`、统一 data/meta envelope 和原样 request ID。
- 本地真实配置保存在被 `.gitignore` 排除的 `.env`，Prisma 生成目录同样未进入 Git。

## 下一步

完成空库 migration 实测后进入 P3：注册/登录、密码哈希、JWT、当前用户上下文、认证限流和 owner-scoped repository 约束。

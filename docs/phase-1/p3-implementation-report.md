# P3 认证与所有权实现报告

## 完成内容

- 在共享 validation 包落地 strict 注册、登录、公开用户和认证响应 schema。
- 邮箱 trim + 小写规范化；密码限制 12..128 字符且不做隐式 trim。
- 使用 Argon2id 哈希密码：19 MiB memory、2 passes、parallelism 1、32-byte output。
- 使用 JOSE 签发/验证 HS256 access token，强制 issuer、audience、算法、tokenUse 和短期过期时间。
- 实现注册、登录和 `/auth/me`；公开用户响应不包含 passwordHash。
- 不存在用户时仍执行 dummy Argon2 verify，登录统一返回 `INVALID_CREDENTIALS`。
- 实现全局 JWT Guard，只有显式 `@Public()` 的健康检查、注册和登录可匿名访问。
- 注册 5 次/分钟、登录 10 次/分钟的路由限流已通过真实 HTTP 测试。
- 建立 project/map/layer/chunk/object/asset owner-scoped repository，所有查询都把 actorId 下推到 Prisma where。
- 建立通用非枚举 404 所有权策略和 enumerate/read/update/delete 测试基线。

## 安全决策

- access token 只携带 `sub` 和 `tokenUse`，当前用户信息每次从数据库读取；删除用户后旧 token 立即失去访问能力。
- 不实现 refresh token；第一阶段当前需求只需要短期 access token，避免提前引入轮换和撤销表。
- 不记录 Authorization header、Token、密码或响应 body；已有结构化日志继续执行敏感字段与数据库 URL 脱敏。
- 用户 A 访问用户 B 的资源与访问不存在资源使用相同 `RESOURCE_NOT_FOUND` 404，不泄漏资源类型或详情。
- ownership repository 不提供裸 ID 查询方法，P4 application service 必须接收 actorId 并复用这些边界。

## 主要文件

- `packages/validation/src/auth.ts`
- `apps/api/src/auth/`
- `apps/api/src/users/users.repository.ts`
- `apps/api/src/ownership/`
- `apps/api/test/auth.integration.test.ts`
- `apps/api/vitest.integration.config.ts`

## 验证

- 单元测试覆盖 Argon2id 参数、密码验证、JWT 签发/篡改/错误 audience、统一凭据错误和所有权查询形状。
- MySQL 集成测试覆盖注册、邮箱规范化、重复邮箱、登录、`/auth/me`、无效 JWT、认证限流和六类跨用户资源。
- CI 增加 MySQL 8.0 service、migration deploy 和 API integration test 步骤。
- `pnpm lint` 与 strict `pnpm typecheck` 通过；全仓 78 个单元测试和 6 个 MySQL 集成测试通过。
- `pnpm build` 通过，Web/API/三个共享包生产构建成功。

## 未完成内容

- 项目、地图、图层、Chunk 和 object 的业务 CRUD/operation transaction 属于 P4。
- refresh token、会话管理和主动撤销未纳入当前阶段；如后续启用，数据库只保存 refresh token 哈希并轮换。
- Web 登录页面与 session 持有属于 P5。

## 下一步

进入 P4，并强制所有 controller/application/repository 路径携带当前 `actorId`，复用 owner-scoped 查询和统一 404 策略。

# 第一阶段实施计划与任务拆分

## 1. 执行原则

按下列工作包顺序做可验证的纵向增量。每个工作包完成后必须通过自己的测试，并执行仓库级质量门禁；失败时先修复，不在红色构建上继续堆功能。

本计划不按页面数量衡量进度，而按用户可验证的能力和架构接口衡量。每个工作包应形成一个范围清晰、可回滚的提交；不要将脚手架、认证、渲染和编辑器全部塞进一个提交。

## 2. 仓库级质量门禁

骨架建立后，根目录统一提供：

```text
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

开发过程中模块级测试可先运行，但合并一个工作包前至少执行 `lint + typecheck + test + build`。`test:e2e` 从工作包 P5 起纳入；需要 MySQL 的 API 集成测试使用独立测试数据库，不碰开发数据。

CI 最低矩阵：install → lint/typecheck → unit tests → API integration tests → build → Playwright smoke。Prisma migration 在空库应用一次，并从上一个迁移状态升级一次。

完成定义：

- TypeScript strict 无错误，不新增裸 `any`、忽略指令或无说明的 eslint disable。
- 新增跨边界输入有 Zod/DTO 验证和反例测试。
- 新增领域行为有单元/集成测试。
- UI 能通过键鼠主路径使用，按钮有可读标签和 disabled 状态。
- 错误路径不破坏当前文档，用户能看到可操作提示。
- README/.env.example/迁移随行为同步。
- 没有把秘密、绝对存储路径、生成资源或数据库文件提交到 Git。

## 3. 工作包总览

| ID  | 工作包                      | 依赖     | 规模 | 主要产物                                       |
| --- | --------------------------- | -------- | ---- | ---------------------------------------------- |
| P0  | 工具链与 workspace 骨架     | 设计冻结 | M    | 可构建空应用、统一脚本、CI                     |
| P1  | 共享模型与数学内核          | P0       | M    | Zod 模型、相机/Chunk 纯函数、测试              |
| P2  | Prisma 与 API 基础设施      | P0-P1    | L    | schema、迁移、错误/验证/日志基线               |
| P3  | 认证与所有权                | P2       | L    | 注册登录、JWT、资源 guard/service 约束         |
| P4  | 项目、地图、图层、Chunk API | P2-P3    | L    | CRUD、聚合文档、操作事务与幂等                 |
| P5  | Web 编辑器壳与数据加载      | P0-P4    | L    | 桌面布局、路由、Query、normalized store        |
| P6  | Pixi 生命周期与相机         | P1,P5    | L    | Canvas、坐标转换、平移缩放、网格/边界          |
| P7  | Command 与历史内核          | P1,P5    | M    | execute/undo/redo、合并、内存上限              |
| P8  | 图层编辑闭环                | P4-P7    | M    | 层面板、排序/显隐/锁定/复制/删除               |
| P9  | 图章、选择与变换            | P4,P6-P8 | XL   | 放置、多选、移动/缩放/旋转/复制/删除           |
| P10 | 自动保存与崩溃恢复          | P4,P7-P9 | L    | operation journal、revision、IndexedDB、状态机 |
| P11 | 基础 PNG 导出               | P6,P9    | M    | 安全分辨率整图预览导出                         |
| P12 | 性能、安全、E2E 与文档收口  | 全部     | L    | 基准、完整验收、README、发布候选               |

规模只表示相对复杂度，不是工期承诺。P4、P9、P10 风险最高，应拆成更小提交，但保持工作包验收原子性。

## 4. 详细任务

### P0 — 工具链与 workspace 骨架

任务：

1. 初始化 pnpm workspace、根 scripts、Node/pnpm engines、共享 tsconfig strict、ESLint 和格式规则。
2. 创建 `apps/web` Vite React TypeScript、`apps/api` NestJS、三个 packages 的最小入口。
3. 建立 Vitest（共享/Web）、Nest/Jest 或统一可行测试方案、Playwright 配置。
4. 创建 `.env.example`、`.gitignore`、根 README；storage 目录只提交说明/占位。
5. 建立 CI 和基于依赖拓扑的 workspace scripts。

验收：空 Web 和 API 可启动；workspace 包能互相通过 package export 引用；根级 lint/typecheck/test/build 全绿；生产 Web bundle 不包含 `DATABASE_URL`。

不做：数据库业务表、编辑器页面、Pixi 场景。

### P1 — 共享模型与数学内核

任务：

1. 在 `map-model` 落地文档、层、stamp 对象、operation、camera、Chunk Zod schema。
2. 实现 `worldToScreen`、`screenToWorld`、指针锚定 zoom、fitToMap、clamp。
3. 实现 `toChunkCoordinate`、`chunkKey`、可见世界 rect 等纯函数。
4. 建立 schemaVersion 迁移注册表；v1 暂无迁移但未知版本明确失败。
5. 生成有效/无效 fixtures，避免测试引用应用内部对象。

测试重点：

- 坐标往返误差；不同 viewport/zoom/camera。
- 指针缩放前后 anchor 世界坐标不变。
- 负 Chunk 边界和极值。
- schema 拒绝未知字段、非有限数、零缩放、坏颜色、层级环所需的服务校验输入。

验收：包无 DOM/Pixi/Nest/Prisma 依赖，可在 Web 与 Node 同时导入。

### P2 — Prisma 与 API 基础设施

任务：

1. 落地 Prisma schema、初始 migration 和最小 seed（测试用户不要带生产口令）。
2. 建立 PrismaService 生命周期、健康检查、测试数据库清理策略。
3. 建立 Zod/DTO pipe、全局异常 filter、统一响应/错误、request ID、结构化日志脱敏。
4. 配置 CORS allowlist、Helmet/等价安全头和基础限流配置接口；不额外引入重量级框架。
5. 实现 StorageProvider 接口和 LocalStorageProvider 的安全路径解析，但第一阶段不开放用户上传。

测试重点：空库迁移、Prisma 连接生命周期、错误结构、未知 DTO 字段、路径穿越单测、日志脱敏。

验收：API 启动会验证必要环境变量；数据库不可用时明确失败；不把连接串写入日志。

### P3 — 认证与所有权

任务：

1. 注册、登录、密码哈希、JWT 签发/验证和当前用户上下文。
2. 登录/注册限流，邮箱规范化，统一凭据错误。
3. 建立 owner-scoped repository 查询规范：所有后续资源用例接收 `actorId`。
4. 为跨用户枚举、越权读取/修改/删除建立测试基类。

验收：合法用户能登录；重复邮箱和坏密码安全失败；用户 A 不能从任何 ID 访问用户 B 的项目，并且响应不泄漏资源详情。

### P4 — 项目、地图、图层、Chunk 与操作 API

建议拆分为 P4a CRUD、P4b operation transaction、P4c Chunk read。

任务：

1. 项目 CRUD、分页和地图摘要。
2. 地图创建事务：Map + MapDocument + 默认 stamp 层；地图读取聚合为 `MapDocument`。
3. 图层 CRUD/reorder，验证 group、环、锁定、删除策略。
4. 占用 Chunk descriptor 分页和单 Chunk payload。
5. `POST operations`：批量白名单、所有权、revision、跨 Chunk 移动、计数、receipt 幂等。
6. 建立 repository/application/controller 分层，所有路径复用同一领域规则。

测试重点：

- 创建地图失败全回滚。
- 同 mutation 重试只应用一次。
- 两个请求使用同 revision 时只一个成功，另一个 409。
- 任意 operation 中混入越权/坏对象时整批回滚。
- 锁定层拒绝对象变换；跨 Chunk 后计数正确。
- 图层 reorder、删除迁移/级联策略。

验收：使用 HTTP 测试完成“创建项目 → 创建地图 → 创建层 → 创建 stamp operation → 读取 Chunk → 更新/删除”的闭环。

### P5 — Web 编辑器壳与数据加载

任务：

1. 项目列表、新建项目/地图、编辑器路由和最近项目入口。
2. 实现顶部、左侧、中央、右侧、底部专业桌面布局；窄屏给出最低尺寸提示，不承诺移动编辑。
3. TanStack Query client、认证 session、API client 和统一错误映射。
4. 建立 normalized map store（layersById/objectsById/chunk membership）和 editor store（tool/selection/panels/save status）。
5. 实现加载编排与 skeleton/error/retry；未经 Zod 验证的数据不能进入 store。

验收：可以通过 UI 创建并打开空地图；刷新后路由恢复；加载错误不白屏；store 中没有 Pixi Application、Texture 或 DisplayObject。

### P6 — Pixi 生命周期与相机

任务：

1. 实现 PixiCanvas React adapter，严格管理 mount/resize/unmount 和 GPU 资源释放。
2. 建立 architecture 文档中的 scene tree、地图边界、动态网格和轻量背景。
3. CameraController 权威状态、world/screen API、wheel/middle/space pan、pointer capture、RAF 合并。
4. 实现 fit map、focus selection 接口和缩放显示。
5. 状态栏以节流快照显示世界坐标、zoom、FPS；不得逐帧重绘 React 主树。

测试：相机数学沿用 P1；组件生命周期测试；Playwright 模拟缩放和平移并校验可观察坐标/zoom；重复进入退出页面无重复 canvas/ticker。

验收：空地图平移缩放接近 60 FPS；以指针为中心；地图尺寸不改变 canvas 像素尺寸。

### P7 — Command 与历史内核

任务：

1. 实现 CommandContext、CommandManager、undo/redo stack、双内存上限和可观测 canUndo/canRedo。
2. 实现 create/update/delete/transform/layer commands 的最小集合。
3. 实现手势 transaction、mergeWith 规则和失败原子性。
4. 领域 patch bus 同时对接 store、renderer projection（后续）和 operation journal 接口。
5. 快捷键 Ctrl/Cmd+Z、Ctrl/Cmd+Shift+Z；输入控件聚焦保护。

测试：execute/undo/redo 恒等；新 execute 清 redo；合并正确；超限裁剪；命令异常不留下半状态；undo/redo 产生可保存 operation。

验收：用纯内存 fixture 完成 100 次混合操作并往返到初始/最终状态，无 Pixi 依赖。

### P8 — 图层编辑闭环

任务：

1. 图层树/列表、激活层、新建、重命名、上下移动/拖拽排序、显隐、锁定、透明度。
2. group 数据结构可用，但 MVP 若不提供嵌套 UI，需要在界面明确；至少不能破坏读取已有 group。
3. 图层复制/删除确认；有对象时明确 delete 或 move 策略。
4. RendererProjection 根据层顺序、显隐、opacity、blend mode 更新 container。
5. 所有操作走 Command，不由组件直接 mutate。

验收：图层顺序和属性立即反映在场景；锁定/隐藏层对象不可被错误编辑；撤销重做和保存后刷新一致。

### P9 — 图章、选择与变换

建议拆分 P9a asset registry/render projection、P9b placement/selection、P9c transform/multi-selection。

任务：

1. 建立原创 mountain/tree/town SVG 清单、来源说明、AssetRegistry 和共享 Texture 生命周期。
2. 素材面板点击放置并支持 HTML5 drag/drop 到画布；drop 坐标通过 camera 转世界坐标。
3. ObjectView create/update/remove、hit area、视口外简单 visibility 切换。
4. 点击、Shift 多选、框选、空白取消、选择状态栏。
5. 移动、缩放、旋转手柄，多选共同 bounds，Esc 取消手势。
6. 复制/粘贴、Delete 删除、前移后移；锁定/隐藏/非 stamp 层策略。
7. pointermove 仅做 preview，pointerup 提交一个 TransformObjectsCommand。

测试：

- drop screen/world 坐标准确。
- 顶层 picking、隐藏/锁定过滤、多选 bounds。
- 单/多对象变换的 undo/redo。
- 一次 500 个 pointermove 的拖动只产生一个历史项。
- 跨 Chunk 移动生成正确 operation。
- 共享 Texture 不因删除一个对象被销毁。

验收：山、树、城镇均能放置；完整满足选择、移动、缩放、旋转、复制、删除、撤销重做。

### P10 — 自动保存与崩溃恢复

任务：

1. OperationJournal 收集 Command patch，保持序列顺序并合并安全的连续更新。
2. AutosaveCoordinator：800 ms 防抖、5 s max wait、单地图串行、指数退避但 409 不重试。
3. `saved/dirty/saving/offline/error/conflict` 状态和顶部/底部反馈；离开页面前 dirty 提示。
4. IndexedDB 先写日志、服务端确认后清理前缀；用户/map/schema/revision 隔离。
5. 启动恢复对话：恢复或丢弃；恢复前 Zod 验证；旧 schema 使用迁移或安全失败。
6. 多标签页用 BroadcastChannel 提醒，真正一致性仍由 revision 保证。

测试：

- 保存过程中又编辑，首次成功后仍是 dirty 而不是 saved。
- 网络失败保留日志，恢复后按顺序重试。
- 乱序风险被串行队列消除。
- 409 进入 conflict 且不覆盖。
- 刷新/异常模拟可恢复，退出登录清理会话恢复数据。

验收：编辑后状态可见，自动保存；刷新加载一致；断网/失败不会静默丢修改。

### P11 — 基础 PNG 导出

任务：

1. 导出对话框提供安全长边选项和预计尺寸；默认 2048。
2. 创建独立导出相机/RenderTexture，隐藏编辑 overlay，等待资源 ready。
3. 限制最大边、总像素和预估内存；设备不支持时降级/给出明确提示。
4. 导出 Blob，清理临时纹理和 URL；文件名安全规范化。
5. 导出前后编辑视口和选择保持不变。

测试：小地图像素尺寸/PNG signature；overlay 不出现在结果；资源失败；连续导出无明显资源增长；超大地图按比例降采样而不分配世界同尺寸纹理。

验收：用户能下载完整地图预览 PNG，且不会因为世界单位尺寸巨大直接申请巨型 Canvas。

### P12 — 性能、安全、E2E 与文档收口

任务：

1. 建立确定性 2,000/5,000 stamp 基准场景，记录设备、浏览器、FPS、可见对象和内存观察。
2. 优化 atlas/batching、事件模式、可见性更新、React selector 和资源释放；不提前引入 MapLibre。
3. 补齐项目/地图/层/对象权限矩阵、批次限制、CORS、登录限流和错误脱敏测试。
4. Playwright 完整验收主路径和至少一个错误恢复路径。
5. README 写安装、MySQL、环境变量、migration、seed、启动、测试、构建、存储目录和限制。
6. 按验收矩阵逐条留证，列出延期能力和第三阶段性能边界。

验收：所有门禁全绿；全新环境按 README 可启动；第一阶段验收矩阵全部通过或有明确、获准的范围变更。

## 5. 第一阶段验收矩阵

| 用户验收项                   | 主要工作包 | 自动验证                     | 手工验证                     |
| ---------------------------- | ---------- | ---------------------------- | ---------------------------- |
| 创建地图项目                 | P3-P5      | API integration + Playwright | 名称/尺寸错误提示            |
| 设置名称和世界尺寸           | P1,P4,P5   | schema/API tests             | 超大尺寸不创建同尺寸 canvas  |
| 缩放和平移                   | P1,P6      | math + Playwright            | 触控板/鼠标手感              |
| 创建、排序、隐藏、锁定图层   | P4,P7,P8   | command/API/UI tests         | 场景与面板一致               |
| 拖入山、树、城镇             | P6,P9      | coordinate/UI tests          | 原创素材观感                 |
| 单选和多选                   | P9         | selection tests + E2E        | 顶层命中/框选反馈            |
| 移动、旋转、缩放、复制、删除 | P7,P9      | command/E2E                  | 多选手柄手感                 |
| 撤销重做                     | P7-P10     | unit + E2E                   | 快捷键与按钮状态             |
| 保存并刷新重载               | P4,P10     | API/recovery/E2E             | 网络失败提示                 |
| 自动保存状态                 | P10        | state machine tests          | saving/error/conflict 可辨识 |
| 导出 PNG                     | P11        | file/pixel smoke             | 浏览器下载和视觉结果         |
| 对象较多仍基本流畅           | P6,P9,P12  | deterministic benchmark      | 记录测试机体验               |

## 6. Playwright 主路径

1. 注册/登录测试用户。
2. 创建项目和指定尺寸地图。
3. 打开编辑器，缩放和平移。
4. 新建两个 stamp 层，重命名并排序。
5. 放置山、树、城镇；框选两个对象并移动/旋转/缩放。
6. 复制后删除，执行 undo/redo。
7. 隐藏一层并验证对象不可见；锁定另一层并验证不可编辑。
8. 等待保存状态为 saved，记录 revision。
9. 刷新并验证层、对象和 transform。
10. 导出 PNG 并校验下载文件类型/非零大小。

另建错误路径：编辑期间模拟 API 离线 → 状态显示 offline 且 IndexedDB 有日志 → 恢复网络 → 保存成功。并发路径用 API 集成测试稳定验证 409，E2E 只做一个多标签页 smoke，避免脆弱测试成为唯一证据。

## 7. 第一阶段不应出现的实现

- 与地图世界尺寸相同的 Canvas、RenderTexture 或背景图片。
- 把 `PIXI.Application`、Texture、Container 放入 Zustand/React state。
- 每次 pointermove 创建 Command、请求 API 或触发整棵 React 树更新。
- 一个包含所有对象的长期 `MapDocument` JSON 列。
- 没有 revision 的 last-write-wins 自动保存。
- 客户端可提交 `relativePath`/磁盘路径的资源 API。
- Redis 作为未保存地图唯一副本；第一阶段不需要启动 Redis/BullMQ。
- 为未来功能提前接入 MapLibre、协作 CRDT 或桌面框架。
- 把 WebP、工程包或原尺寸超大导出伪装为第一阶段已完成。

## 8. 下一步执行顺序

设计评审通过后从 P0 开始创建项目骨架。P0 完成即运行完整门禁并提交实现报告，报告固定包含：完成内容、修改文件、设计取舍、验证命令和结果、未完成内容、下一步 P1。随后逐包执行，不跨过失败门禁。

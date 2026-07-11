# P5 Web 编辑器壳与数据加载实现报告

## 完成内容

- 建立登录/注册、地图室和 `/editor/:mapId` 编辑器路由；认证会话经过共享 Zod schema 校验后保存在 `sessionStorage`，刷新可以恢复当前路由。
- 实现项目列表、最近地图入口，以及“创建项目 → 创建地图 → 打开编辑器”的 UI 闭环。
- 接入 TanStack Query，负责项目与地图加载生命周期、重试和 mutation；路由页面按需加载，避免编辑器代码进入登录页首包。
- 建立统一 API client 和错误映射。成功响应先解析 envelope，再使用共享 Zod schema 验证 data；不可信响应不会进入应用状态。
- 建立 Zustand normalized map store：`layersById`、`objectsById` 和 `chunkObjectIds`；地图文档与 Chunk payload 验证通过后一次性 hydrate。
- 建立 editor store：工具、选择、左右面板与保存状态；store 中不包含 Pixi Application、Texture 或 DisplayObject。
- 初次加载并行请求文档和 Chunk descriptor，再以四路有限并发加载 Chunk payload；提供 skeleton、错误提示和 retry。
- 完成顶部、素材侧栏、工具栏、中央工作区、属性侧栏和底部状态栏的专业桌面布局；小于 `980 × 620` 时显示最低尺寸提示。

## 视觉与动画

- 视觉语言采用深墨绿色、暖纸色和低饱和苔藓色，配合制图等高线、细网格和克制阴影，保持简洁但具有编辑工作室质感。
- 路由进入、地图卡片、登录模式切换、创建弹窗、账户菜单、属性页签、地图展开与左右面板展开/收起均有短促过渡。
- 动画统一使用约 `180–580 ms` 的缓动，并为 `prefers-reduced-motion` 提供近乎无动画的降级。
- 隐藏面板同步设置 `aria-hidden`、`visibility` 与 `pointer-events`，避免不可见控件留在键盘与辅助技术操作路径中。

## 关键修复

- 明确配置 Vite `envDir` 指向 workspace 根目录，保证 Web 读取根 `.env` 中的 `VITE_API_BASE_URL`。
- 修复 React 19 下 Zustand selector 每次创建新数组导致的订阅快照无限更新；改为订阅稳定对象后使用 `useMemo` 派生排序。
- 调整编辑器加载判断顺序，确保请求失败进入 error/retry，而不是长期停留在 skeleton。

## 主要文件

- `apps/web/src/pages/`
- `apps/web/src/components/`
- `apps/web/src/services/`
- `apps/web/src/stores/`
- `apps/web/src/styles.css`
- `apps/web/e2e/smoke.spec.ts`
- `packages/validation/src/projects.ts`

## 验证

- `pnpm lint` 通过。
- `pnpm typecheck` 通过。
- `pnpm test` 通过，共 80 个单元测试。
- `pnpm build` 通过，登录、地图室和编辑器已拆分为独立路由 chunk。
- Playwright E2E 通过，2 条主路径覆盖最近地图打开/刷新恢复，以及创建项目与地图后自动进入编辑器。
- 使用真实本地 API 和浏览器完成视觉验证：登录、空地图室、创建弹窗、地图加载、属性页签与面板收起均正常。

## 下一步

进入 P6：接入 PixiJS Application 生命周期、视口尺寸 canvas、相机平移缩放、网格与地图边界。

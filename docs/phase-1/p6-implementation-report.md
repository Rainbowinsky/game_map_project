# P6 Pixi 生命周期与相机实现报告

## 完成内容

- 接入 PixiJS 8，新增 `PixiCanvas` React 适配器与独立 `MapRenderer` 服务；严格处理异步初始化、`ResizeObserver`、卸载、ticker 和 GPU 子树销毁。
- Canvas 像素尺寸始终等于编辑器视口，并将 device pixel ratio 上限设为 2；地图世界尺寸只参与相机与世界坐标计算。
- 建立 `worldRoot / mapBackground / mapClipRoot / layerRoot / worldGrid / worldOverlay / mapBoundary / screenOverlay` 场景树，为 P8-P9 的渲染投影预留明确挂载点。
- 使用程序图形绘制地图纸张、双层边界与轻量等高线；动态网格只覆盖当前可见世界范围，并设置最大线数预算，不创建世界同尺寸纹理。
- 新增 `CameraController` 作为相机权威状态，复用 `map-model` 的世界/屏幕转换、指针锚定缩放和适应地图数学。
- 高频滚轮与平移输入通过 `requestAnimationFrame` 合并；支持滚轮缩放、中键拖动、Space + 左键与平移工具，使用 pointer capture 保证手势能在画布外结束。
- 提供平滑的适应地图和 focus rect 接口，尊重 `prefers-reduced-motion`；缩放按钮和适应地图按钮已接入真实相机。
- 状态栏以约 10 Hz 显示世界坐标、缩放、FPS 与对象数，不驱动 React 逐帧渲染。

## 流畅性与视觉

- Pixi Application、Container、Graphics 均只保存在渲染服务实例中，不进入 Zustand 或 React state。
- 相机手势只更新 Pixi 世界矩阵与动态网格；React 仅接收节流后的遥测快照。
- 动态网格根据屏幕密度调整世界步长，在远景时自动合并细网格，避免超大地图产生大量 Graphics 指令。
- 视觉延续深墨绿工作台、暖纸地图、克制苔藓色和细线边界；Canvas 入场、悬浮控制与空地图标记使用短促缓动，并为低动态偏好降级。
- 真实浏览器视觉检查确认画布、左右面板、工具栏、地图边界、网格和悬浮控制层级清晰，无异常遮挡。

## 测试

- `CameraController` 单测覆盖 RAF 合并平移、指针锚定缩放和销毁后取消待处理帧。
- Playwright 覆盖 Pixi Canvas 单实例、稳定后的滚轮缩放、平移手势开始/结束和刷新后的重新挂载。
- 重复进入与刷新编辑器不会叠加 Canvas；组件卸载会断开 observer、事件监听、timer、相机帧任务并销毁 Pixi Application。

## 验证

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e`

## 下一步

进入 P7：实现 CommandManager、执行/撤销/重做、手势事务、历史合并与双内存上限，并保持 Command 内核不依赖 Pixi。

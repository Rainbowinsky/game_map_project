# P2-4 文字与地点实施报告

P2-4 已交付文字对象、地点资料、主 marker、搜索详情与画布定位。所有写入继续通过 command → patch bus → operation journal → autosave 链路；地点与 marker 在同一命令和同一 operation 批次中原子保存。

## 交付内容

- 工具栏新增文字（T）与地点（L）工具。文字支持内容、字号和对齐；地点支持名称、类型、摘要、纯文本详情与标签。右侧图层面板提供统一“新增图层”分类菜单，可创建文字、地点标记及全部既有图层类型。
- `CreateLocationCommand` 在一个历史条目中创建 Location 与主 marker，撤销和重做保持引用一致；地点更新、删除同样进入可撤销 operation 批次。
- 地图加载新增 owner-scoped `GET /maps/:mapId/locations`，支持名称/摘要、类型和标签筛选参数；客户端加载后归一化保存地点。
- 地点面板按名称、类型和标签即时搜索。点击 marker 或地点条目打开详情，可编辑、删除并定位到画布。
- Pixi 增量投影与 PNG 导出均支持主题化文字和 marker；文字使用主题字体与颜色。
- 文字工具点击已有文字的真实渲染范围会打开画布内编辑框；新建文字直接进入编辑，点击范围外提交，`Ctrl/Cmd + Enter` 提交，`Esc` 取消。文字与地点标记拖动均实时更新 Pixi 预览，marker 移动同时在同一 operation 批次同步 Location 坐标。
- 地点摘要和详情始终由 React 文本节点渲染，不使用 HTML 注入接口；共享 schema 继续限制文字长度、行数、坐标、缩放范围和引用。

## 验收证据

- 命令测试覆盖 Location 与 marker 同一 patch/operation 批次创建、撤销和引用恢复。
- `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 全部通过。
- `pnpm test:integration` 通过：2 个测试文件、11 项集成测试，覆盖既有 location/marker 原子事务、跨地图和跨用户素材拒绝场景。

## 边界

- P2-4 使用内置程序化 marker；自定义 marker 图标的上传和素材选择由 P2-5 接入。
- 当前地点列表随地图全量加载，符合第二阶段全量已加载对象边界；分页、空间索引与远程 Chunk 调度留待第三阶段。

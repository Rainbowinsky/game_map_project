# P2-2 路径与区域实施报告

P2-2 已在 P2-0 的 v2 对象契约和 P2-1 的主题 token 基础上交付道路、河流与区域的创建和节点编辑能力。持久化数据仍是严格的 `path` / `region` 领域对象；Pixi 图形、绘制预览和节点叠层只作为投影，不成为数据真源。

## 交付内容

- 工具栏新增道路、河流和区域工具及键盘快捷键。路径按多点输入，双击或 Enter 完成；区域点击起点闭合、双击或 Enter 完成；Esc 取消未提交手势。
- 图层面板可创建 `vector-path` 与 `region` 图层。工具优先使用当前可编辑的同类图层，没有可用图层时给出明确错误，不跨类型写入。
- 新增 `CreatePathCommand`、`CreateRegionCommand`、`UpdatePathGeometryCommand` 与 `UpdateRegionGeometryCommand`。一次完整绘制或节点拖动只产生一个历史条目，并继续生成既有 `object.create` / `object.update` operation，进入 patch bus、operation journal 与 autosave。
- 选中路径或区域后显示节点；节点拖动只提交通过 v2 schema 的几何。区域产生自交或退化形状时继续显示并保留上一次有效候选，不写入非法对象。
- 命中检测支持区域内部、路径宽度和贝塞尔曲线采样；对象边界、框选、可见区域裁剪及 Chunk 归属会随几何中心更新。
- `ObjectProjection` 增量投影图章、路径与区域；路径/区域颜色来自当前主题的 road、river、region token。PNG 导出复用同一绘制函数和同一份已解析 token。
- 属性面板提供道路/河流首尾宽度、区域描边宽度和节点数量，并保留复制、层级移动、删除、撤销/重做能力。

## 数据与兼容边界

- 未新增数据库表或 API 路由；服务端继续通过 `POST /maps/:mapId/operations` 的 v2 判别联合校验和保存。
- 路径节点保存世界坐标以及可选的相对贝塞尔手柄；本工作包可正确渲染和命中已有手柄，交互编辑首版聚焦锚点。
- 样式字段仍保存 token 引用；编辑器和导出不会把 Pixi 指令、画布像素或自由颜色 JSON 写回文档。
- 继续维持当前全量加载边界；空间索引、LOD、可见 Chunk 流式加载不在 P2-2 内提前实现。

## 验收证据

- 命令测试覆盖路径创建、节点更新、operation 内容、撤销与图层/对象整体恢复。
- 几何测试覆盖贝塞尔路径命中、区域内部命中与几何边界。
- 投影测试覆盖路径进入语义图层、主题重绘、可见计数与增量移除。
- Playwright 场景覆盖道路多点绘制、节点拖动、撤销、区域闭合以及自动保存。
- `pnpm lint`、`pnpm typecheck`、`pnpm test` 与 `pnpm build` 通过；P2-2 不修改 API、Prisma 或 storage，因此不新增数据库迁移。

## 后续边界

P2-3 可复用本工作包的本地预览与单手势单命令结构实现地形笔刷。路径贝塞尔手柄的直接拖动、节点插入/删除和更细粒度样式选择可在不改变持久化契约的前提下继续增强，但不得绕过几何 schema 或 operation journal。

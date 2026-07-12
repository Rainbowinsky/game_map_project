# P2-1 主题基础实施报告

P2-1 已将主题作为编辑器与 PNG 导出的唯一视觉入口。主题仍是内置只读定义，不新增用户主题、主题持久化或所有权模型。

## 交付内容

- Web 端新增 `ThemeRegistry`，注册原创的“明亮幻想手绘”和“晴空海图”两套内置主题，并在未知 `themeId` 时确定性回退至 `mvp-classic`。
- 编辑器顶部支持切换内置主题；该变更经既有 `map.update` command、operation journal 与 autosave 链路保存。未知主题会显示可恢复提示。
- `map-artwork`、网格、选择叠层与 `ObjectProjection` 都接收解析后的 token；现有图章继续使用原有纹理、透明度和显式 tint 规则。
- `MapRenderer` 将同一个已解析 token 对象传入 PNG exporter，导出不再自行解析或使用独立颜色常量。

## 验收证据

- `ThemeRegistry` 单元测试覆盖内置主题、未知主题回退、重复 ID 与缺失回退主题。
- `pnpm lint`、`pnpm test`、`pnpm typecheck`、`pnpm build` 均通过。
- `pnpm test:e2e` 通过 7 个编辑器、导出、恢复与性能场景。

## 后续边界

P2-2 至 P2-4 的 path、region、terrain、text 和 marker 投影将继续消费同一主题 token；本工作包不提前实现这些对象的绘制工具或投影。

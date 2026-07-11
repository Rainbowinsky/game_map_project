# P9 图章、选择与变换实现报告

## 完成内容

- 新增原创山峰、常青树和城镇三枚 SVG 图章，素材清单包含稳定资源 ID、类别、名称与来源说明；素材面板支持点击选用和 HTML5 拖放到画布。
- 新放置图章的初始世界缩放按当前相机 zoom 反算，使其在不同放大级别下保持约 64 CSS px 的可操作视觉尺寸；结果仍受领域模型最小/最大缩放约束，既避免高倍放大时出现巨型图章，也不会在最大 zoom 下小到无法选取。
- 新增 `AssetRegistry` 与 `ObjectProjection`：相同资源只加载一份共享 Pixi Texture，单个对象删除只释放引用，渲染器销毁时才统一销毁纹理。
- 对象投影支持增量创建、更新、删除、跨图层重挂、zIndex、透明度、颜色、翻转和视口外可见性裁剪；图层与对象投影各自拥有明确的资源生命周期。
- 放置坐标统一经相机从 screen 转为 world，并通过 `CreateObjectCommand` 写入 store；当前图层不可编辑时会回退到可编辑 stamp 层，否则显示可操作错误。
- 选择支持点击、Shift 增减多选、拖框选择和空白取消；拾取按图层显示顺序、对象 zIndex 排序，并过滤隐藏、锁定对象及其祖先图层。
- 选择框提供移动、四角等比缩放和顶部旋转手柄；多选围绕共同 bounds 变换。pointermove 仅更新 Pixi preview，pointerup 只提交一个 `TransformObjectsCommand`，Esc 会无历史地取消手势。
- 属性面板支持单对象坐标、角度和缩放编辑，多选状态展示；支持复制、删除、前移和后移。
- 接入 Ctrl/Cmd+C、Ctrl/Cmd+V、Ctrl/Cmd+D、Delete/Backspace、`[`、`]` 以及 V/H/S 工具快捷键，并保护文本输入控件。
- 复制、粘贴、批量删除和层级调整使用 Command transaction，保持一次用户动作对应一条撤销记录；跨 Chunk 位置更新继续复用 P7 的 Chunk 重算与 operation 生成。

## 测试与验收

- 选择几何单测覆盖顶层拾取、隐藏层过滤、多选 bounds、框选相交、共同中心移动/缩放/旋转。
- AssetRegistry 单测验证两对象共享同一 Texture，释放一个对象不会提前销毁共享资源。
- Playwright 新增完整主路径：放置图章、选择并拖动、打开属性、复制、删除、撤销。
- 真实浏览器以本地 API 和生产预览验证三枚 SVG、选择手柄、属性面板和 1280 px 桌面布局。
- 仓库级 `format:check`、`lint`、`typecheck`、`test`、`build` 与 3 项 Playwright E2E 全部通过。

## 后续衔接

- P10 将订阅既有 PatchBus/OperationJournal，把 P9 生成的 create/update/delete operation 接入自动保存、revision 冲突和 IndexedDB 崩溃恢复。
- P11 可直接复用 ObjectProjection 与 AssetRegistry 等待资源 ready，并在独立导出场景中排除 selection/marquee overlay。

# P7 Command 与历史内核实现报告

## 提交标记说明

上一条提交的标题误写为 `P7`，其实际实现内容为 P6（Pixi 生命周期与相机）。本工作包才是 P7 的正式实现；不改写既有 Git 历史，以本报告和实际代码范围为准。

## 完成内容

- 新增不依赖 React、Zustand 或 Pixi 的 `CommandManager`：提供 execute / undo / redo、可观察的 `canUndo` / `canRedo`、事务和历史清理。
- 历史同时受条目数和估算字节数约束，默认上限为 200 条和 32 MiB；新命令会在成功应用后清空 redo。
- 实现对象 create / update / delete / transform 与图层 create / update / delete / reorder 命令；对象变换会重新计算所属 Chunk。
- 实现短时间窗（750 ms）的同对象 `mergeKey` 合并；手势可通过 `beginTransaction()` 合并成一个历史项。
- 通过 `DomainPatch` 同时承载 Store 变更和可持久化 `MapOperation`；undo / redo 也产生逆向/正向 operation。
- 新增 `PatchBus` 与 `OperationJournal` 接口，供 P8 的渲染投影和 P10 的自动保存/崩溃恢复直接订阅；订阅者异常不会破坏已提交的领域状态和历史。
- 为 normalized map store 增加原子 `applyPatches()`：批量 patch 完整校验图层层级、对象归属和 Chunk 成员关系，失败时不留下半状态。
- 编辑器顶部撤销/重做按钮已接入历史快照；支持 Ctrl/Cmd+Z、Ctrl/Cmd+Shift+Z，并保护 input、textarea、select 和 contenteditable 的原生撤销。

## 测试

- CommandManager 单测覆盖 execute/undo/redo 恒等、redo 清空、合并窗口、条目/字节上限、事务、跨 Chunk 变换、图层删除移动与恢复、PatchBus operation 以及非法 patch 的原子失败。
- P7 的纯命令层没有 Pixi 依赖；Map store 仅作为 `CommandContext` 适配器。

## 后续衔接

- P8 的图层面板操作将调用现有图层命令，并订阅 PatchBus 投影更新。
- P9 的放置、选择与变换工具将在 pointerup 时提交 create / transform command；pointermove 仅做 renderer preview。
- P10 将以 `connectOperationJournal()` 对接 IndexedDB、串行自动保存和 revision 冲突状态机。

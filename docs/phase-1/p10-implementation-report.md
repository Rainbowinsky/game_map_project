# P10 自动保存与崩溃恢复实现报告

## 完成内容

- `DurableOperationJournal` 订阅 P7 PatchBus，只收集可持久化 operation，保持命令顺序，并安全合并相邻的同对象、同图层和地图元数据更新。
- 日志按用户、地图、schemaVersion 和 baseRevision 隔离；每次编辑后异步串行写入 IndexedDB，网络请求必须等待对应日志落盘。
- 保存批次会先持久化 `clientMutationId`、baseRevision、operation 快照和序列水位。若服务端提交成功后客户端在确认前崩溃，恢复时会复用相同 mutation ID 获取幂等 receipt，不会用新请求误报 revision 冲突。
- `AutosaveCoordinator` 实现 800 ms 防抖、5 s max wait、最多 500 个 operation 的批次、单地图严格串行发送，以及 1–30 秒指数退避。
- 保存期间发生的新编辑位于当前批次水位之后；首次请求成功后状态仍为 `dirty` 并继续下一批，不会错误显示 `saved`。
- 网络失败进入 `offline/error` 并保留日志；浏览器恢复在线或用户点击状态提示后立即重试。HTTP 409 进入 `conflict`，不重试、不覆盖、不清理日志。
- 编辑器顶部和状态栏展示 `saved/dirty/saving/offline/error/conflict`；离线/错误状态可点击重试，离开编辑器和刷新时对未保存数据进行保护。
- 启动时校验 IndexedDB 日志。revision 与 schema 匹配时提供“恢复更改/丢弃日志”；不匹配或损坏时安全阻止自动覆盖，并提供重试检查或明确丢弃。
- 恢复 operation 通过现有 Command 规则原子重放，失败会回滚；重放过程不重复写 journal，恢复完成后再启动自动保存。
- `BroadcastChannel` 提醒同一用户在多个标签页打开或编辑相同地图；最终一致性仍由服务端 revision 409 保证。
- 退出登录和认证失效时按用户清理本机会话恢复日志。
- Prisma seed 补齐三枚稳定 ID 的内置图章记录；服务端允许读取 `ownerId = null` 的内置 Asset，同时继续拒绝其他用户的私有 Asset，使 P9 图章能够通过 P10 operation API 持久化。

## 测试与验收

- Journal 单测覆盖连续更新合并、active mutation 持久化、保存中新增编辑、确认前缀清理和用户/地图隔离。
- Autosave 单测覆盖 800 ms/5 s 调度、保存中继续编辑、严格串行、网络失败保留与同 mutation ID 重试、409 停止重试。
- BroadcastChannel 单测覆盖同地图跨标签页通知。
- Playwright 覆盖离线编辑写入 IndexedDB、刷新后恢复、恢复联网自动保存，以及再次刷新从服务端 Chunk 载入一致对象。
- Web strict typecheck、lint、单元测试、生产构建和 Playwright E2E 全部通过。

## 后续衔接

- P11 导出只读取已恢复后的 normalized store；导出不会改变 journal、revision、相机或选择状态。
- P12 将补充大量 operation 的批次基准、IndexedDB 容量/失败遥测和多标签冲突人工验收矩阵。

# P12 性能、安全、E2E 与文档收口实现报告

## 完成内容

- 新增 2,000/5,000 图章确定性场景和 `test:benchmark` 命令。场景只复用三张内置 SVG 纹理，固定对象数据可用于 Node/Pixi 投影基准和 Chromium 端到端观测。
- `ObjectProjection` 改为增量 `upsert/remove`：命令 patch 只同步受影响对象；完整同步时按图层统一排序，避免每个对象都重复排序。所有图章关闭 Pixi 事件模式，编辑器继续使用画布级精确命中，避免第二套逐图章 hit-test。
- 视口裁剪只在可见性实际变化时写入 Pixi；状态栏增加 FPS、可见/总对象数和待保存 operation 数，Playwright 为两组场景保存加载耗时、观测 FPS、对象数和可取得的 JS 堆数据附件。
- IndexedDB 持久 operation journal 现在会显式报告写入失败，并在下一次批量保存前重新持久化 active mutation。保存协调器将本地恢复存储失败显示为可重试错误，不会在 journal 未确认落盘时请求服务端。
- 安全回归补齐 operation 500 条批量边界和拒绝未允许 CORS origin 的测试；既有认证限流、所有权隔离、输入严格校验、错误脱敏与导出上限测试继续作为 P12 门禁。
- Playwright 主路径、离线恢复、PNG 下载以及两组压力场景均纳入 CI；CI 在构建后安装 Chromium 并执行 `pnpm test:e2e`。
- README、阶段索引、基准运行规范和本报告已同步；全新环境的安装、MySQL、迁移、seed、启动、质量门禁和第一阶段边界仍在根 README 中。

## 验收证据矩阵

| 验收项                                      | 自动证据                                                                          | 人工证据                                          |
| ------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------- |
| 项目/地图创建、相机、图层、图章、选择与变换 | `apps/web/e2e/smoke.spec.ts`                                                      | 画布和面板状态一致                                |
| 撤销重做、保存刷新与离线恢复                | Command/Autosave 单测及 smoke 的恢复路径                                          | save status 可辨识且可重试                        |
| PNG 导出                                    | export 单测和 smoke 的下载/PNG signature                                          | 浏览器下载视觉检查                                |
| 2,000/5,000 对象压力                        | `stamp-benchmark.test.ts`、`stamp-projection.bench.ts`、`stamp-benchmark.spec.ts` | 按 `p12-benchmark-protocol.md` 记录设备与性能面板 |
| 权限、批量、CORS、限流和错误脱敏            | API unit/integration tests                                                        | 用非授权账号核对无资源信息泄漏                    |
| 全新环境和发布候选                          | README 命令与 CI 全部门禁                                                         | MySQL/浏览器环境按 README 启动                    |

## 设计取舍与后续边界

- 基准记录实际观测值而不使用跨机器的硬性 FPS/毫秒阈值；固定输入、浏览器附件和手工设备信息使回归可比较，但不会把 CI 虚拟机当作性能认证设备。
- 第一阶段仍会加载所有已占用 Chunk；5,000 图章仅是压力观察范围。十万对象、空间索引、可见 Chunk 流式加载、LOD、Worker、协作 CRDT、MapLibre 和分块高分辨率导出延期到后续阶段。
- IndexedDB 只保存未确认 journal，MySQL 仍是长期真源。浏览器拒绝或耗尽本地恢复存储时，编辑器保留未保存更改并进入可重试 error，不伪装成已保存。

## 验证命令

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm test:e2e
pnpm --filter @fantasy-map/web test:benchmark
```

本次 P12 工作区验证已通过：`lint`、`typecheck`、`test`、`test:integration`、`build`、`test:e2e`（7 个 Chromium 场景）和 `test:benchmark`。当前 Node/Pixi 基准的均值为约 0.12 ms（2,000）和 0.27 ms（5,000）；该数值只作为本机回归参考，不是跨设备发布阈值。每次发布候选仍应按基准规范保存 Chromium HTML 报告与目标设备观察记录。

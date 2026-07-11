# P11 基础 PNG 导出实现报告

## 完成内容

- 编辑器顶栏的“导出”入口现已可用。导出对话框提供安全输出长边选项，默认 `2048 px`，实时展示最终像素尺寸、像素总量和临时内存预估。
- 新增纯计算导出计划：输出长边同时受 `4096 px` 配置上限、WebGL `MAX_TEXTURE_SIZE` 和 `16,777,216` 总像素上限约束。超出预算时始终等比降采样，不会按世界单位尺寸分配 Canvas 或纹理。
- 临时内存预估按 RenderTexture 与 PNG 读回画布两份 RGBA 缓冲计算；当前最大安全方图约为 `128 MiB` 临时缓冲。
- 新增独立导出场景：复用地图背景、图层层级、图章 transform、混合模式和透明度，但每次导出都创建新的 `Container`、独立相机变换和临时 `RenderTexture`。不重设编辑器相机、不重挂现有 DisplayObject，也不包含动态网格、框选、选择手柄或 DOM UI。
- 导出前按可见图层筛选对象，并等待去重后的 SVG 图章纹理加载完成。未知或加载失败的素材会列出资源 ID 并中止，且不会分配导出 RenderTexture。
- 通过 `Blob` 发起下载；文件名由地图名称规范化生成，排除路径字符；临时 object URL 会在下载触发后撤销。每次导出都会在 `finally` 中释放导出场景和临时 RenderTexture，不销毁编辑器共享纹理。
- 地图背景绘制被提炼为共享函数，确保编辑视图与导出视图的纸张、轮廓和边框保持一致。

## 修改文件

- `apps/web/src/exports/png-export-plan.ts`：安全尺寸、像素/内存预算、展示格式与安全文件名。
- `apps/web/src/exports/png-exporter.ts`：独立 Pixi 导出场景、资源就绪检查、Blob 与下载清理。
- `apps/web/src/renderer/map-artwork.ts`、`MapRenderer.ts`：复用地图底图绘制，并向编辑器公开导出能力。
- `apps/web/src/components/ExportDialog.tsx`、`PixiCanvas.tsx`、`EditorPage.tsx`、`styles.css`：导出对话框、进度/错误反馈和下载交互。
- `apps/web/src/exports/*.test.ts`、`apps/web/e2e/smoke.spec.ts`：安全约束、资源失败、共享资源及真实 PNG 下载验证。

## 设计取舍

- P11 固定为整图等比预览 PNG，而非原始世界尺寸或分块高清导出；后两者会在大世界中带来不可控的 GPU/Canvas 分配，属于后续阶段能力。
- GPU 上限以运行中渲染器的 `MAX_TEXTURE_SIZE` 为准，并与应用安全配置取更小值。没有可读 WebGL 上限时仍使用 `4096 px` 配置上限，不把未知设备当作无限容量。
- 导出复用已由 Pixi 全局资源缓存管理的纹理，但不复用编辑器的 Sprite/Container，以保持编辑器的相机、可见性裁剪和 selection 状态完全不变。

## 验证结果

- `pnpm --filter @fantasy-map/web run typecheck`：通过。
- `pnpm --filter @fantasy-map/web run test`：通过，17 个测试文件、54 项测试。
- `pnpm --filter @fantasy-map/web run lint`：通过。
- `pnpm --filter @fantasy-map/web run build`：通过。
- `pnpm format:check`：通过。
- `pnpm --filter @fantasy-map/web run test:e2e`：通过，Chromium 中验证导出对话框的默认 `2048 px` 尺寸、PNG 下载、PNG signature 及连续二次导出。

## 后续衔接

- P12 将补齐大对象量基准、导出内存/失败遥测、性能收口与完整阶段验收矩阵；高分辨率分块导出仍不属于第一阶段基础 PNG 范围。

# P2-5 素材库实施报告

P2-5 已交付受认证保护的素材上传、图片真实性校验、SVG 净化、缩略图、分类管理、跨用户隔离和引用安全删除。自定义图片可在地点面板中选作主 marker 图标；地点与 marker 的图标引用继续通过同一 command、patch batch 和 operation revision 原子保存。

## 服务端交付

- 新增 `POST/GET/PATCH/DELETE /assets`、素材原图/缩略图读取端点，以及 `asset-categories` CRUD。
- 上传先写入随机临时 key；服务端完成格式解码、magic bytes、声明 MIME/扩展名、字节、像素和尺寸上限校验后，计算 SHA-256 并生成 256px WebP 缩略图。原图与缩略图全部成功后才移动到 owner/asset UUID 最终 key 并创建数据库记录；失败路径清理临时和最终文件。
- 图像处理采用 `sharp`。它支持本阶段所需的 PNG/JPEG/WebP/SVG 尺寸读取和缩略图，在 Windows 与 CI 使用预编译二进制；依赖锁定在 workspace lockfile 中。
- SVG 先经过主动内容拒绝和 `sanitize-html` 严格元素/属性白名单，拒绝 script、事件属性、外部/数据 URL、`foreignObject`、嵌入资源、DOCTYPE/entity、CSS `url()` 与 `@import`，净化结果再由 `sharp` 解码和栅格化。
- API 响应只返回 asset ID 和受控 API URL，不返回 `relativePath`、`thumbnailPath` 或绝对路径。原图和缩略图读取都要求 Bearer 身份，并执行 owner 或内置资源可见性检查。
- 删除前检查 `Location.iconAssetId` 以及 stamp/marker payload 引用；存在引用时返回 `ASSET_IN_USE` 和安全的引用数量。无引用时软删除记录并同步清理文件；普通列表和内容读取隐藏软删除素材。
- 自定义分类名称由服务校验与 `(ownerId, name)` 唯一索引共同保护；内置分类只读，自定义分类删除后其素材保留为未分类。

## Web 交付

- 左侧素材面板升级为素材库，支持分类筛选/创建/删除、自定义图片上传、缩略图预览和安全删除，同时保留既有原创内置图章。
- 地点详情新增 marker 图标选择器。`UpdateLocationIconCommand` 在一个历史条目和一个 autosave operation 批次中同时更新地点与主 marker，支持撤销/重做。
- `AssetRegistry` 可通过认证请求加载自定义素材 Blob，并继续复用引用计数纹理；marker 在有 `iconAssetId` 时投影为固定视觉尺寸的 Pixi Sprite，无图标或加载失败时编辑器仍保持可操作。
- PNG 导出通过同一认证纹理加载器解析自定义 marker，画布与整图导出保持一致；资源不可用时在分配导出场景前明确失败。

## 安全与验证

- 单元测试覆盖 raster 解码/哈希/缩略图、MIME/扩展名伪造、四类主动 SVG、受限 SVG、StorageProvider 安全移动和地点/marker 图标原子命令。
- 集成测试覆盖真实 multipart 上传、缩略图读取、分类名称冲突、跨用户列表/分类/二进制隔离、恶意 SVG、MIME 伪造、引用拒删和软删除隐藏。
- P2-5 不引入后台 worker 或虚构异步清理状态；文件清理在当前请求内以幂等方式执行。远程对象存储、病毒扫描和队列式清理仍留待后续基础设施阶段。

# 第二阶段架构与契约设计

## 1. 设计目标与边界

第二阶段的所有画面元素仍以可编辑领域对象保存。Pixi `Graphics`、`Text`、`Sprite` 和缩略图只是投影，不能成为数据真源。一次完整手势只生成一个 command/history 条目和一批 operation；绘制过程中的 pointer move 仅更新本地预览，pointer up 才提交。

阶段二采用“语义对象 + 样式引用”的方案：地形、路径、文字、区域与地点各自拥有严格 schema；颜色、纹理、字体和默认样式由主题 token 提供。这样既可在第一阶段的全量加载模型内实现，也不会阻断第三阶段把对象按 Chunk 流式调度。

## 2. 领域模型增量

`packages/map-model` 中的 `mapObjectSchema` 扩展为下表的 discriminated union。所有对象保留现有基础字段（`id`、`mapId`、`layerId`、`chunk`、可见性、锁定、`metadata`、revision 和时间戳）。

| 类型             | 推荐图层      | 持久化内容                                       | 关键约束                                                  |
| ---------------- | ------------- | ------------------------------------------------ | --------------------------------------------------------- |
| `terrain-stroke` | `raster`      | terrain kind、笔刷参数、世界坐标采样点、随机种子 | 至少两个点；点数、总长度、JSON 字节数均受限；不能保存位图 |
| `region`         | `region`      | 闭合顶点、名称、填充与描边样式引用               | 至少三个非共线顶点；不接受自交多边形                      |
| `path`           | `vector-path` | `road`/`river`、锚点及可选贝塞尔手柄、样式引用   | 至少两个锚点；河流有起终宽度，控制点和几何范围受限        |
| `text`           | `text`        | 文本、锚点、字号、对齐、字体/颜色 token          | 文本长度、字号、行数受限；禁止任意 HTML                   |
| `marker`         | `marker`      | `locationId`、图标 asset 引用、显示缩放范围      | 所属地点与对象必须属于同一地图；一个地点至多一个主标记    |

第一阶段的 `stamp` 保持不变。`MapObject.type` 不能退化为自由字符串，也不能允许任意 `payload` 穿透到客户端。对于每种对象，创建输入和允许更新的字段都必须分别定义；跨类型更新一律拒绝。

### 几何格式

- 世界点使用现有有限数值 `WorldPoint` 约束，所有点必须位于地图边界内。
- 路径节点采用 `{ anchor, handleIn?, handleOut? }`。缺省手柄表示直线段；手柄相对锚点保存，便于整体移动和以后简化。
- 区域先以顶点环保存；P2 不做布尔合并、洞、多部件面或跨层吸附。自交检查在 schema 后的几何校验中完成。
- `terrain-stroke` 保存经距离阈值抽样后的中心线和笔刷参数，而非每个 pointer event。相邻采样点最小距离与最大点数由统一常量控制。

## 3. 数据库与迁移

现有 `MapObject.payload` 与 `metadata` 足以承载上述严格领域对象，P2-0 不新增每类对象表，也不向 API 暴露 Prisma `Json` 输入。需要的关系和索引如下：

1. `Location` 增加可空且唯一的 `markerObjectId`，并与 `MapObject` 建立一对零或一关系；服务层同时验证 mapId 一致。
2. `Location.iconAssetId`、`Asset.categoryId` 建立 Prisma relation，并在删除素材时检查 `MapObject` payload、地点图标和主题资源引用。
3. `Asset` 增加 `deletedAt`（软删除）和可选 `originalFileName` 审计字段；前者不向普通列表返回，后者只作受限展示，不参与磁盘路径。
4. 为 `Location(mapId, name)`、`Asset(ownerId, categoryId, createdAt)` 添加查询索引。实际 migration 只在 P2-0 契约测试通过后生成。

地图文档 `schemaVersion` 在首次写入 P2 对象时升级为 2；迁移 1 → 2 只更新版本号，不改变已有图层、图章或背景数据。旧客户端携带版本 1 operation 时 API 返回明确的兼容性错误，而不是静默混写。迁移函数、fixtures、API schema 和持久化映射须在同一变更中提交。

## 4. Operation 与自动保存

保留 `POST /maps/:mapId/operations` 作为地图画布写入的唯一入口，新增严格 operation：

```text
object.create / object.update / object.delete / object.reorder
location.create / location.update / location.delete
```

前四类复用既有 operation 名称但将对象输入扩展到新的判别联合；地点操作进入同一 revision 事务，避免 marker 和地点资料分别成功。批次预验证顺序为：地图与 revision → 图层归属及锁定 → 所有对象/地点 schema → 跨对象引用 → 单批大小与 JSON 字节限制 → 写库与 Chunk 计数 → revision/receipt。

命令层新增 `DrawTerrainStrokeCommand`、`CreatePathCommand`、`UpdatePathGeometryCommand`、`CreateRegionCommand`、`CreateTextCommand` 和地点命令。连续节点拖动在 pointer up 合并为一个 `UpdatePathGeometryCommand`；笔刷预览不写 operation journal。

## 5. 素材 API 与存储安全

P2 注册以下正式 API，并沿用响应 envelope、认证、owner-scoped 查询和受控 URL：

| 方法                    | 路径                                       | 规则                                                                                                                              |
| ----------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `POST`                  | `/assets`                                  | `multipart/form-data`；服务端生成 UUID key，校验文件大小、扩展名、声明 MIME、magic bytes 和解析后的尺寸，计算 SHA-256，生成缩略图 |
| `GET`                   | `/assets?cursor=&limit=&kind=&categoryId=` | cursor 分页；内置资源与当前用户资源可见，不泄露其他用户资源                                                                       |
| `PATCH`                 | `/assets/:assetId`                         | 仅允许 display name、分类与安全 metadata 白名单                                                                                   |
| `DELETE`                | `/assets/:assetId`                         | 先做引用检查；被引用时返回可处理错误，未引用时软删除并异步清理文件                                                                |
| `POST/GET/PATCH/DELETE` | `/asset-categories` 及 `/:id`              | 名称唯一性以 owner scope 处理；内置分类只读                                                                                       |

第一批只接受 PNG、JPEG、WebP 与 SVG 图章/纹理，分别设置像素、解压尺寸和字节上限；SVG 必须经专用 sanitizer，拒绝 script、事件属性、外链资源、`foreignObject` 和危险 URL。缩略图由服务端从已验证的像素源生成，失败时整个上传失败并清理临时文件。实现前必须选择并锁定经过维护的图像解码/缩略图依赖；不在浏览器端信任 MIME 或生成缩略图。

公开文件仍通过 `StorageProvider.getPublicDescriptor` 的受控 URL 提供，存储 key 和绝对路径不得出现在响应、错误详情或日志中。

## 6. 主题与渲染

在 `packages/map-model` 定义只读 `ThemeDefinition` 和 `ThemeTokens`：海洋、陆地、海岸、网格、选择态、路径、区域、文字、默认字体栈、纹理/图标 asset 引用和 blend-mode 白名单。Web 端提供 `ThemeRegistry`，以 `document.themeId` 解析主题；未知主题使用确定的内置回退并显示可恢复警告。

首套内置主题为原创“明亮幻想手绘风”。它只由 token、仓库原创 SVG/程序纹理和许可清单构成；不复制任何游戏的 logo、字体、图标或纹理。`drawMapArtwork`、网格、选择层、路径、区域和导出都接收同一个解析后的 token，避免编辑器和 PNG 导出颜色不一致。

渲染层新增按图层类型划分的 projection（terrain、path、region、text、marker、stamp）。投影接收领域 patch，不读取 Zustand；对象选择仍使用画布级几何命中。P2 不引入把所有对象纳入 Pixi 交互树的逐对象事件模型。

## 7. 缩略导航图

缩略图是独立的低分辨率 `Graphics` 投影：绘制地图边界、区域/路径/图章的简化轮廓和当前可视矩形。它由已加载的领域对象增量更新，不调用整图 PNG 导出，也不读取 GPU 像素。点击或拖动缩略图计算受边界限制的相机中心；缩略图隐藏时不做渲染工作。P2 的缩略图不承担十万对象或远程 Chunk 的概览职责。

## 8. 安全、兼容与验收底线

- 所有几何、文本、颜色、字号、JSON 字节、批量数量和分页参数都有 schema 上限；拒绝 NaN/Infinity、未知字段和越界坐标。
- 上传、删除、地点和资产分类 API 必须经过所有权检查与独立限流；删除和物理清理具备可重试语义。
- 用户素材和地点详情在 UI 中一律按文本渲染，禁止 `dangerouslySetInnerHTML`。
- 现有图章、自动保存恢复、PNG 导出、选择变换与权限隔离是每个 P2 工作包的回归门禁。

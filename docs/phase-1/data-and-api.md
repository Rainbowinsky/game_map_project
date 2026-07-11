# 第一阶段共享数据、Prisma 与 API 契约

本文是实现基线，不是已生成的源码。落地时 `packages/map-model` 和 `packages/validation` 中的 Zod schema 是运行时契约真源，TypeScript 类型由 schema 推导；Prisma 类型不得直接泄漏到 Web。

## 1. 标识、时间与版本约定

- 所有实体 ID 和 `clientMutationId` 使用服务端/客户端生成的 UUID。
- 时间在 API 中使用 UTC ISO 8601 字符串，数据库使用毫秒精度 DateTime。
- 世界坐标、旋转和缩放使用有限 `number`；API 拒绝 `NaN`、Infinity、零缩放和过大绝对值。
- 旋转单位统一为弧度，顺时针/坐标方向由渲染适配层统一测试。
- `schemaVersion` 表示文档结构版本；`revision` 表示某张地图的并发写版本，两者不可混用。
- 第一版 `schemaVersion = 1`，迁移函数签名为 `migrateMapDocument(input, from, to)`，每步迁移后重新验证。
- Chunk 坐标采用数学 floor：负坐标 `-1` 属于 Chunk `-1`，不能用截断取整。

## 2. 共享领域模型

下面展示契约形状；实现时使用 `z.object(...).strict()` 并从 Zod 推导类型。

```ts
type EntityId = string;

interface WorldPoint {
  x: number;
  y: number;
}

interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CameraState {
  /** 视口中心对应的世界坐标 */
  x: number;
  y: number;
  /** 屏幕 CSS 像素 / 世界单位 */
  zoom: number;
}

interface ChunkCoordinate {
  x: number;
  y: number;
}

interface ObjectTransform {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}
```

### 2.1 地图文档

`MapDocument` 是 API 聚合视图。数据库不会把 `layers` 和全部对象重新塞入一个 JSON 列；对象通过 Chunk 端点传输。

```ts
type MapLayerType =
  'background' | 'raster' | 'vector-path' | 'stamp' | 'marker' | 'text' | 'region' | 'group';

type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';

interface MapBackground {
  kind: 'solid' | 'tiled-texture';
  color: string; // 规范化 #RRGGBB 或 #RRGGBBAA
  assetId?: EntityId; // tiled-texture 时必填
  textureScale?: number;
}

interface MapSettings {
  chunkSize: 512 | 1024;
  worldUnit: 'unit' | 'meter' | 'kilometer' | 'mile' | 'custom';
  customUnitLabel?: string;
  grid: {
    enabled: boolean;
    size: number;
    snap: boolean;
  };
  camera: {
    minZoom: number;
    maxZoom: number;
  };
}

interface MapLayer {
  id: EntityId;
  mapId: EntityId;
  parentId: EntityId | null;
  name: string;
  type: MapLayerType;
  order: number;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0..1
  blendMode: BlendMode;
  createdAt: string;
  updatedAt: string;
}

interface MapDocument {
  schemaVersion: 1;
  id: EntityId;
  projectId: EntityId;
  name: string;
  width: number;
  height: number;
  themeId: string;
  background: MapBackground;
  layers: MapLayer[];
  settings: MapSettings;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
```

不变量：width/height 为正且有产品上限；第一阶段建议创建范围 `1_000..1_000_000` 世界单位。`parentId` 只能指向同地图 group 层，禁止环。兄弟层 `order` 在服务端事务内归一化为连续整数。背景层最多一个且不可作为普通对象目标；第一阶段对象只能放在 stamp 层。

### 2.2 对象模型

第一阶段只实现 stamp discriminant。未来对象类型通过 schemaVersion 迁移增加，不能让未知 payload 静默进入 renderer。

```ts
interface MapObjectBase extends ObjectTransform {
  id: EntityId;
  mapId: EntityId;
  layerId: EntityId;
  chunk: ChunkCoordinate;
  type: string;
  name: string | null;
  zIndex: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
  metadata: Record<string, unknown>;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

interface StampMapObject extends MapObjectBase {
  type: 'stamp';
  assetId: EntityId;
  stampKind: 'mountain' | 'tree' | 'town';
  tint: string | null;
  flipX: boolean;
  flipY: boolean;
  randomSeed: number;
}

type MapObject = StampMapObject;
```

数据库可将常用变换列独立存储，把类型专属字段放入 `payload` JSON；repository 必须在出入库两侧组装并验证完整 `MapObject`。`metadata` 有序列化大小上限，不能成为任意大内容的后门。

### 2.3 Chunk 模型与纯函数

```ts
interface MapChunkDescriptor {
  id: EntityId;
  mapId: EntityId;
  coordinate: ChunkCoordinate;
  objectCount: number;
  revision: number;
  updatedAt: string;
}

interface MapChunkPayload extends MapChunkDescriptor {
  objects: MapObject[];
}

const toChunkCoordinate = (point: WorldPoint, chunkSize: number): ChunkCoordinate => ({
  x: Math.floor(point.x / chunkSize),
  y: Math.floor(point.y / chunkSize),
});

const chunkKey = ({ x, y }: ChunkCoordinate): string => `${x}:${y}`;
```

对象所属 Chunk 由对象锚点 `x/y` 决定，不能信任客户端单独传来的 chunk 值；服务端根据 MapSettings 重算。对象视觉边界可以跨 Chunk，第三阶段视口查询要增加资源半径/空间索引处理，第一阶段不宣称解决该问题。

## 3. 编辑操作契约

编辑器自动保存只发送领域操作，不发送 Pixi 对象。字段更新采用白名单 discriminated union，不接受任意 JSON Patch 路径。

```ts
type MapOperation =
  | { type: 'object.create'; object: StampMapObjectInput }
  | { type: 'object.update'; objectId: EntityId; changes: ObjectChanges }
  | { type: 'object.delete'; objectId: EntityId }
  | { type: 'object.reorder'; layerId: EntityId; orderedObjectIds: EntityId[] }
  | { type: 'layer.create'; layer: MapLayerInput }
  | { type: 'layer.update'; layerId: EntityId; changes: LayerChanges }
  | { type: 'layer.reorder'; parentId: EntityId | null; orderedLayerIds: EntityId[] }
  | {
      type: 'layer.delete';
      layerId: EntityId;
      objectPolicy: 'delete' | 'move';
      targetLayerId?: EntityId;
    }
  | { type: 'map.update'; changes: MapMetadataChanges };

interface ApplyOperationsRequest {
  schemaVersion: 1;
  baseRevision: number;
  clientMutationId: string;
  operations: MapOperation[]; // 1..500，且有请求体大小上限
}

interface ApplyOperationsResponse {
  mapId: EntityId;
  acceptedMutationId: string;
  previousRevision: number;
  revision: number;
  updatedAt: string;
  changedChunkKeys: string[];
}
```

`ObjectChanges` 只允许 transform、layerId、name、zIndex、visible、locked、opacity、metadata 和 stamp 专属可编辑字段。禁止修改 `id/mapId/type/createdAt/revision`。服务端重算 Chunk，验证 layer 类型/锁定/地图归属，并将批次作为单个事务处理。

同一 map + `clientMutationId` 重试返回首次响应，不重复执行。不同 mutation 使用过期 `baseRevision` 返回 409。

## 4. Prisma 数据模型提案

以下 schema 覆盖用户要求的模型，并增加 `OperationReceipt` 支持不依赖 Redis 的幂等保存。具体索引长度和数据库字符集在 P1 迁移时通过实际 MySQL 验证。

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

enum AssetKind {
  STAMP
  TEXTURE
  IMAGE
  THUMBNAIL
}

enum ExportStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
  CANCELED
}

model User {
  id           String   @id @default(uuid()) @db.Char(36)
  email        String   @unique @db.VarChar(191)
  passwordHash String   @db.VarChar(255)
  displayName  String   @db.VarChar(100)
  createdAt    DateTime @default(now()) @db.DateTime(3)
  updatedAt    DateTime @updatedAt @db.DateTime(3)

  projects        Project[]
  assets          Asset[]
  assetCategories AssetCategory[]
}

model Project {
  id          String   @id @default(uuid()) @db.Char(36)
  ownerId     String   @db.Char(36)
  name        String   @db.VarChar(120)
  description String?  @db.Text
  createdAt   DateTime @default(now()) @db.DateTime(3)
  updatedAt   DateTime @updatedAt @db.DateTime(3)

  owner User  @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  maps  Map[]

  @@index([ownerId, updatedAt])
}

model Map {
  id        String   @id @default(uuid()) @db.Char(36)
  projectId String   @db.Char(36)
  name      String   @db.VarChar(120)
  createdAt DateTime @default(now()) @db.DateTime(3)
  updatedAt DateTime @updatedAt @db.DateTime(3)

  project           Project            @relation(fields: [projectId], references: [id], onDelete: Cascade)
  document          MapDocument?
  layers            MapLayer[]
  chunks            MapChunk[]
  objects           MapObject[]
  locations         Location[]
  versions          MapVersion[]
  exportTasks       ExportTask[]
  operationReceipts OperationReceipt[]

  @@index([projectId, updatedAt])
}

model MapDocument {
  id            String   @id @default(uuid()) @db.Char(36)
  mapId         String   @unique @db.Char(36)
  schemaVersion Int      @default(1)
  width         Int
  height        Int
  themeId       String   @db.VarChar(100)
  background    Json
  settings      Json
  revision      Int      @default(0)
  createdAt     DateTime @default(now()) @db.DateTime(3)
  updatedAt     DateTime @updatedAt @db.DateTime(3)

  map Map @relation(fields: [mapId], references: [id], onDelete: Cascade)
}

model MapLayer {
  id        String   @id @default(uuid()) @db.Char(36)
  mapId     String   @db.Char(36)
  parentId  String?  @db.Char(36)
  name      String   @db.VarChar(120)
  type      String   @db.VarChar(32)
  sortOrder Int
  visible   Boolean  @default(true)
  locked    Boolean  @default(false)
  opacity   Float    @default(1)
  blendMode String   @default("normal") @db.VarChar(24)
  createdAt DateTime @default(now()) @db.DateTime(3)
  updatedAt DateTime @updatedAt @db.DateTime(3)

  map      Map        @relation(fields: [mapId], references: [id], onDelete: Cascade)
  parent   MapLayer?  @relation("LayerTree", fields: [parentId], references: [id], onDelete: Restrict)
  children MapLayer[] @relation("LayerTree")
  objects  MapObject[]

  @@index([mapId, parentId, sortOrder])
}

model MapChunk {
  id          String   @id @default(uuid()) @db.Char(36)
  mapId       String   @db.Char(36)
  x           Int
  y           Int
  revision    Int      @default(0)
  objectCount Int      @default(0)
  createdAt   DateTime @default(now()) @db.DateTime(3)
  updatedAt   DateTime @updatedAt @db.DateTime(3)

  map     Map         @relation(fields: [mapId], references: [id], onDelete: Cascade)
  objects MapObject[]

  @@unique([mapId, x, y])
  @@index([mapId, updatedAt])
}

model MapObject {
  id        String   @id @db.Char(36)
  mapId     String   @db.Char(36)
  layerId   String   @db.Char(36)
  chunkId   String   @db.Char(36)
  type      String   @db.VarChar(32)
  name      String?  @db.VarChar(120)
  x         Float
  y         Float
  rotation  Float    @default(0)
  scaleX    Float    @default(1)
  scaleY    Float    @default(1)
  zIndex    Int      @default(0)
  visible   Boolean  @default(true)
  locked    Boolean  @default(false)
  opacity   Float    @default(1)
  payload   Json
  metadata  Json
  revision  Int      @default(0)
  createdAt DateTime @default(now()) @db.DateTime(3)
  updatedAt DateTime @updatedAt @db.DateTime(3)

  map   Map      @relation(fields: [mapId], references: [id], onDelete: Cascade)
  layer MapLayer @relation(fields: [layerId], references: [id], onDelete: Restrict)
  chunk MapChunk @relation(fields: [chunkId], references: [id], onDelete: Restrict)

  @@index([mapId, chunkId, layerId])
  @@index([layerId, zIndex])
  @@index([mapId, type])
}

model Location {
  id          String   @id @default(uuid()) @db.Char(36)
  mapId       String   @db.Char(36)
  name        String   @db.VarChar(120)
  type        String   @db.VarChar(50)
  x           Float
  y           Float
  summary     String?  @db.Text
  description String?  @db.LongText
  regionId    String?  @db.Char(36)
  iconAssetId String?  @db.Char(36)
  tags        Json
  customFields Json
  minZoom     Float?
  maxZoom     Float?
  createdAt   DateTime @default(now()) @db.DateTime(3)
  updatedAt   DateTime @updatedAt @db.DateTime(3)

  map Map @relation(fields: [mapId], references: [id], onDelete: Cascade)

  @@index([mapId, type])
}

model AssetCategory {
  id        String   @id @default(uuid()) @db.Char(36)
  ownerId   String?  @db.Char(36)
  name      String   @db.VarChar(100)
  createdAt DateTime @default(now()) @db.DateTime(3)
  updatedAt DateTime @updatedAt @db.DateTime(3)

  owner  User?   @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  assets Asset[]

  @@index([ownerId, name])
}

model Asset {
  id           String    @id @default(uuid()) @db.Char(36)
  ownerId      String?   @db.Char(36)
  categoryId   String?   @db.Char(36)
  kind         AssetKind
  displayName  String    @db.VarChar(120)
  relativePath String    @db.VarChar(500)
  thumbnailPath String?  @db.VarChar(500)
  mimeType     String    @db.VarChar(100)
  extension    String    @db.VarChar(16)
  byteSize     BigInt
  width        Int?
  height       Int?
  sha256       String    @db.Char(64)
  metadata     Json
  createdAt    DateTime  @default(now()) @db.DateTime(3)
  updatedAt    DateTime  @updatedAt @db.DateTime(3)

  owner    User?          @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  category AssetCategory? @relation(fields: [categoryId], references: [id], onDelete: SetNull)

  @@index([ownerId, kind, createdAt])
  @@index([sha256])
}

model MapVersion {
  id           String   @id @default(uuid()) @db.Char(36)
  mapId        String   @db.Char(36)
  number       Int
  sourceRevision Int
  label        String?  @db.VarChar(120)
  snapshotJson Json?
  snapshotPath String?  @db.VarChar(500)
  createdAt    DateTime @default(now()) @db.DateTime(3)

  map Map @relation(fields: [mapId], references: [id], onDelete: Cascade)

  @@unique([mapId, number])
  @@index([mapId, createdAt])
}

model ExportTask {
  id           String       @id @default(uuid()) @db.Char(36)
  mapId        String       @db.Char(36)
  status       ExportStatus @default(PENDING)
  format       String       @db.VarChar(16)
  options      Json
  progress     Int          @default(0)
  outputPath   String?      @db.VarChar(500)
  errorCode    String?      @db.VarChar(64)
  errorMessage String?      @db.VarChar(500)
  createdAt    DateTime     @default(now()) @db.DateTime(3)
  updatedAt    DateTime     @updatedAt @db.DateTime(3)

  map Map @relation(fields: [mapId], references: [id], onDelete: Cascade)

  @@index([mapId, status, createdAt])
}

model OperationReceipt {
  id               String   @id @default(uuid()) @db.Char(36)
  mapId            String   @db.Char(36)
  clientMutationId String   @db.Char(36)
  previousRevision Int
  resultingRevision Int
  response          Json
  createdAt         DateTime @default(now()) @db.DateTime(3)

  map Map @relation(fields: [mapId], references: [id], onDelete: Cascade)

  @@unique([mapId, clientMutationId])
  @@index([createdAt])
}
```

### 4.1 Prisma 不变量说明

- `Map` 采用需求中的模型名；业务代码导入时使用语义化 repository 类型，避免和 JS `Map` 混淆。
- `Map.name` 是名称真源；API 聚合 `MapDocument.name`。不在 `MapDocument` 行重复名称。
- `mapId` 在 `MapObject` 中是有意冗余，用于所有权过滤和查询；事务必须验证 `layer.mapId`、`chunk.mapId` 都相同。
- `MapChunk.objectCount` 是可重建计数，所有跨 Chunk 移动事务同时修正源/目标计数。
- `MapVersion` 的 `snapshotJson` 与 `snapshotPath` 必须且只能使用一个，由应用层验证；大地图优先 path。
- `Asset.relativePath` 和所有 output/snapshot path 都是 storage provider key，不是客户端可提交的绝对路径。
- 内置资源的 `ownerId = null`，用户资源必须有 owner；访问规则不可仅依赖 nullable 字段。
- `OperationReceipt` 定期清理，但保留时间必须覆盖客户端重试窗口。

## 5. HTTP 通用约定

基地址：`/api/v1`。除注册/登录和明确公开资源外，使用 `Authorization: Bearer <access-token>`。响应携带 `X-Request-Id`。

成功：

```json
{
  "data": {},
  "meta": { "requestId": "uuid" }
}
```

游标分页：

```json
{
  "data": [],
  "meta": {
    "requestId": "uuid",
    "nextCursor": "opaque-or-null",
    "hasMore": false
  }
}
```

统一错误：

```json
{
  "error": {
    "code": "MAP_REVISION_CONFLICT",
    "message": "Map has changed since the supplied revision.",
    "requestId": "uuid",
    "details": {
      "expectedRevision": 18,
      "actualRevision": 20
    }
  }
}
```

`details` 只能包含安全、机器可处理的信息。生产环境不返回堆栈、SQL、Prisma 错误、Token 或文件路径。

常用状态码：400 schema/业务输入；401 未认证；403 无权；404 不泄漏他人资源存在性时可替代 403；409 revision/唯一性冲突；413 上传或批次过大；415 媒体类型不支持；422 文件内容与声明不符；429 限流。

## 6. 第一阶段 API 契约

### 6.1 Auth

| 方法 | 路径             | 请求                               | 响应                                        |
| ---- | ---------------- | ---------------------------------- | ------------------------------------------- |
| POST | `/auth/register` | `{ email, password, displayName }` | 201 `{ user, accessToken }` 或既定 token 对 |
| POST | `/auth/login`    | `{ email, password }`              | 200 `{ user, accessToken }` 或既定 token 对 |

邮箱规范化后比较；密码有长度上限避免哈希 DoS；错误不区分邮箱不存在和密码错误。

### 6.2 Projects

| 方法   | 路径                       | 关键约定                                             |
| ------ | -------------------------- | ---------------------------------------------------- |
| GET    | `/projects?cursor=&limit=` | 仅当前用户，默认按 updatedAt 倒序，limit 有上限      |
| POST   | `/projects`                | `{ name, description? }`，201                        |
| GET    | `/projects/:id`            | 返回项目摘要和地图摘要，不内嵌对象                   |
| PATCH  | `/projects/:id`            | 白名单 `{ name?, description? }`                     |
| DELETE | `/projects/:id`            | 204；第一阶段可要求确认 token/header，事务删除元数据 |
| POST   | `/projects/:id/duplicate`  | 第一阶段后段；明确异步阈值，不能半复制               |

### 6.3 Maps

| 方法   | 路径        | 关键约定                                                                                                  |
| ------ | ----------- | --------------------------------------------------------------------------------------------------------- |
| POST   | `/maps`     | `{ projectId, name, width, height, themeId?, background?, settings? }`；事务创建 document + 默认 stamp 层 |
| GET    | `/maps/:id` | 返回聚合 `MapDocument`，不内嵌对象                                                                        |
| PATCH  | `/maps/:id` | `{ baseRevision, clientMutationId, changes }`；内部走同一 operation service                               |
| DELETE | `/maps/:id` | 204，所有权检查                                                                                           |

返回 `ETag: "map-<id>-r<revision>"` 可作为缓存辅助，但写入真源仍是 body 中的 `baseRevision`。

### 6.4 Layers

| 方法   | 路径                        | 关键约定                                                        |
| ------ | --------------------------- | --------------------------------------------------------------- |
| GET    | `/maps/:id/layers`          | 文档顺序；可单独刷新                                            |
| POST   | `/maps/:id/layers`          | `{ baseRevision, clientMutationId, layer }`                     |
| PATCH  | `/maps/:id/layers/:layerId` | `{ baseRevision, clientMutationId, changes }`                   |
| DELETE | `/maps/:id/layers/:layerId` | body 明确 objectPolicy；不得隐式产生孤儿                        |
| PUT    | `/maps/:id/layers/order`    | `{ baseRevision, clientMutationId, parentId, orderedLayerIds }` |

编辑器自动保存可以统一通过 `/operations` 发 layer 操作；这些 REST 端点复用同一个 application service，不能维护第二套规则。

### 6.5 Chunks

| 方法 | 路径                                                      | 关键约定                                                                      |
| ---- | --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| GET  | `/maps/:id/chunks?cursor=&limit=&minX=&maxX=&minY=&maxY=` | 无范围时返回占用 Chunk descriptor 分页，不返回全部对象                        |
| GET  | `/maps/:id/chunks/:x/:y`                                  | 返回 descriptor + objects；不存在的空 Chunk 返回空 payload 或 404，项目内统一 |
| PUT  | `/maps/:id/chunks/:x/:y`                                  | 仅导入/恢复用途的受限整块替换；需要 revision、mutationId、数量/体积上限       |

普通编辑不使用 PUT 覆盖整个 Chunk，避免并发丢失；使用 operations。x/y 必须是安全整数并有限制。

### 6.6 Operations

`POST /maps/:id/operations` 使用第 3 节请求/响应。事务步骤：

1. 以 ownerId 约束查询地图和 document。
2. 查找相同 mutation receipt；存在则返回记录响应。
3. 比较 baseRevision。
4. 预验证整批操作、ID 唯一性、图层锁定、归属和限制。
5. 按确定顺序写对象/层/Chunk 计数。
6. revision 增 1，写 receipt，提交事务。

任何一步失败全部回滚。批次不能部分成功。

## 7. 已设计但后续阶段启用的 API

以下路径保留契约方向，但第一阶段不注册假实现；到对应阶段再形成正式 schema 和测试。

| 方法   | 路径                                       | 阶段                                                       |
| ------ | ------------------------------------------ | ---------------------------------------------------------- |
| POST   | `/assets`                                  | 第二阶段：multipart 上传、magic-byte/尺寸/哈希校验、缩略图 |
| GET    | `/assets?cursor=&limit=&kind=&categoryId=` | 第二阶段                                                   |
| DELETE | `/assets/:id`                              | 第二阶段：引用检查/软删除策略                              |
| POST   | `/maps/:id/versions`                       | 第四阶段：从已确认 revision 生成不可变快照                 |
| GET    | `/maps/:id/versions?cursor=&limit=`        | 第四阶段                                                   |
| POST   | `/maps/:id/exports`                        | 第四阶段：BullMQ 高清/分块导出                             |
| GET    | `/maps/:id/exports/:taskId`                | 第四阶段：进度与受控下载                                   |

第一阶段 PNG 是 Web 客户端安全分辨率导出，因此不会为了满足路由清单而创建一个同步、阻塞 API 的高清导出端点。

## 8. DTO 与验证策略

- 共享纯数据 DTO：以 `packages/validation` Zod schema 为真源，可在 Nest pipe 中解析。
- 上传和框架特有 DTO：使用 Nest/Multer 能良好集成的 class-validator 或专用 pipe，但输出仍映射到共享领域 schema。
- 请求对象默认 strict；对 PATCH 使用显式字段集合，不把 Prisma input 暴露为 DTO。
- 所有字符串 trim 并限制长度；颜色、UUID、游标、排序字段、分页 limit、operation 数量、JSON 深度/字节都有上限。
- 响应在服务层边界映射，BigInt byteSize 序列化为十进制字符串，绝不让 JSON.stringify 运行时失败。

## 9. 契约测试清单

- 每个 schema 的有效/无效 fixture；包括未知字段、NaN/Infinity、负缩放、超限 metadata。
- 负坐标和 Chunk 边界 `-1025/-1024/-1/0/1023/1024`。
- MapDocument schemaVersion 迁移和拒绝未来未知版本。
- 操作批次原子性、幂等重试、旧 revision 409。
- 跨用户 project/map/layer/chunk/object ID 组合不能越权。
- 锁定层、跨地图 layerId、伪造 chunk、重复 object ID 被拒绝。
- 删除图层的 delete/move 两种策略和事务回滚。
- 错误响应不包含绝对路径、Prisma 详情或秘密。

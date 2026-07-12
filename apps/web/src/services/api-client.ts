import { z } from 'zod';
import type { LoginRequest, RegisterRequest } from '@fantasy-map/validation';
import {
  authResponseSchema,
  projectListResponseSchema,
  projectResponseSchema,
  type CreateMapRequest,
  type CreateProjectRequest,
} from '@fantasy-map/validation';
import {
  mapChunkPayloadSchema,
  mapChunkDescriptorSchema,
  mapDocumentSchema,
  locationSchema,
  applyOperationsRequestSchema,
  applyOperationsResponseSchema,
  type ApplyOperationsRequest,
  type ApplyOperationsResponse,
  type MapChunkPayload,
  type MapDocument,
} from '@fantasy-map/map-model';

import { useSessionStore } from '../stores/session-store.js';

const apiBaseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ??
  'http://127.0.0.1:3000/api/v1';

const envelopeSchema = z
  .object({ data: z.unknown(), meta: z.object({ requestId: z.string().min(1) }).strict() })
  .strict();

const apiErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        requestId: z.string().optional(),
        details: z.record(z.unknown()).optional(),
      })
      .strict(),
  })
  .strict();

const chunkListSchema = z
  .object({
    items: z.array(mapChunkDescriptorSchema),
    nextCursor: z.string().uuid().nullable(),
  })
  .strict();
const locationListSchema = z.object({ items: z.array(locationSchema) }).strict();
export const assetSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(['STAMP', 'TEXTURE', 'IMAGE', 'THUMBNAIL']),
    categoryId: z.string().uuid().nullable(),
    displayName: z.string(),
    mimeType: z.string(),
    extension: z.string(),
    byteSize: z.number().nonnegative(),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    metadata: z.record(z.unknown()),
    originalFileName: z.string().nullable(),
    builtIn: z.boolean(),
    contentUrl: z.string(),
    thumbnailUrl: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export const assetCategorySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    builtIn: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
const assetListSchema = z
  .object({
    items: z.array(assetSchema),
    nextCursor: z.string().uuid().nullable(),
  })
  .strict();
const assetCategoryListSchema = z.object({ items: z.array(assetCategorySchema) }).strict();
export type Asset = z.infer<typeof assetSchema>;
export type AssetCategory = z.infer<typeof assetCategorySchema>;

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiRequest<Output>(
  path: string,
  schema: z.ZodType<Output>,
  options: RequestInit = {},
  accessToken?: string,
): Promise<Output> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body && !(options.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', '无法连接地图服务，请检查网络后重试。', 0);
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (
      response.status === 401 &&
      accessToken &&
      useSessionStore.getState().session?.accessToken === accessToken
    ) {
      useSessionStore.getState().clearSession();
    }
    const parsed = apiErrorSchema.safeParse(body);
    throw new ApiError(
      parsed.success ? parsed.data.error.code : `HTTP_${response.status}`,
      parsed.success ? parsed.data.error.message : '请求未能完成，请稍后重试。',
      response.status,
      parsed.success ? parsed.data.error.requestId : undefined,
    );
  }

  const envelope = envelopeSchema.safeParse(body);
  const parsed = envelope.success ? schema.safeParse(envelope.data.data) : null;
  if (!parsed?.success) {
    throw new ApiError('INVALID_RESPONSE', '服务返回了无法识别的数据。', response.status);
  }
  return parsed.data;
}

async function apiNoContent(path: string, accessToken: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
  }).catch(() => {
    throw new ApiError('NETWORK_ERROR', '无法连接地图服务，请检查网络后重试。', 0);
  });
  if (response.ok) return;
  const parsed = apiErrorSchema.safeParse(await response.json().catch(() => null));
  throw new ApiError(
    parsed.success ? parsed.data.error.code : `HTTP_${response.status}`,
    parsed.success ? parsed.data.error.message : '请求未能完成，请稍后重试。',
    response.status,
    parsed.success ? parsed.data.error.requestId : undefined,
  );
}

export const api = {
  login: (input: LoginRequest) =>
    apiRequest('/auth/login', authResponseSchema, { method: 'POST', body: JSON.stringify(input) }),
  register: (input: RegisterRequest) =>
    apiRequest('/auth/register', authResponseSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  listProjects: (accessToken: string) =>
    apiRequest('/projects?limit=30', projectListResponseSchema, {}, accessToken),
  createProject: (accessToken: string, input: CreateProjectRequest) =>
    apiRequest(
      '/projects',
      projectResponseSchema,
      { method: 'POST', body: JSON.stringify(input) },
      accessToken,
    ),
  createMap: (accessToken: string, projectId: string, input: CreateMapRequest) =>
    apiRequest(
      `/projects/${projectId}/maps`,
      mapDocumentSchema,
      { method: 'POST', body: JSON.stringify(input) },
      accessToken,
    ),
  getMap: (accessToken: string, mapId: string): Promise<MapDocument> =>
    apiRequest(`/maps/${mapId}`, mapDocumentSchema, {}, accessToken),
  listChunks: (accessToken: string, mapId: string) =>
    apiRequest(`/maps/${mapId}/chunks?limit=100`, chunkListSchema, {}, accessToken),
  getChunk: (
    accessToken: string,
    mapId: string,
    coordinate: { x: number; y: number },
  ): Promise<MapChunkPayload> =>
    apiRequest(
      `/maps/${mapId}/chunks/${coordinate.x}/${coordinate.y}`,
      mapChunkPayloadSchema,
      {},
      accessToken,
    ),
  listLocations: (accessToken: string, mapId: string) =>
    apiRequest(`/maps/${mapId}/locations`, locationListSchema, {}, accessToken),
  listAssets: (
    accessToken: string,
    filters: { kind?: Asset['kind']; categoryId?: string } = {},
  ) => {
    const query = new URLSearchParams({ limit: '100' });
    if (filters.kind) query.set('kind', filters.kind);
    if (filters.categoryId) query.set('categoryId', filters.categoryId);
    return apiRequest(`/assets?${query}`, assetListSchema, {}, accessToken);
  },
  uploadAsset: (
    accessToken: string,
    input: {
      file: File;
      displayName: string;
      kind: 'STAMP' | 'TEXTURE' | 'IMAGE';
      categoryId?: string;
    },
  ) => {
    const form = new FormData();
    form.set('file', input.file);
    form.set('displayName', input.displayName);
    form.set('kind', input.kind);
    if (input.categoryId) form.set('categoryId', input.categoryId);
    return apiRequest('/assets', assetSchema, { method: 'POST', body: form }, accessToken);
  },
  updateAsset: (
    accessToken: string,
    assetId: string,
    changes: { displayName?: string; categoryId?: string | null },
  ) =>
    apiRequest(
      `/assets/${assetId}`,
      assetSchema,
      { method: 'PATCH', body: JSON.stringify(changes) },
      accessToken,
    ),
  deleteAsset: async (accessToken: string, assetId: string): Promise<void> => {
    await apiNoContent(`/assets/${assetId}`, accessToken);
  },
  listAssetCategories: (accessToken: string) =>
    apiRequest('/asset-categories', assetCategoryListSchema, {}, accessToken),
  createAssetCategory: (accessToken: string, name: string) =>
    apiRequest(
      '/asset-categories',
      assetCategorySchema,
      { method: 'POST', body: JSON.stringify({ name }) },
      accessToken,
    ),
  deleteAssetCategory: async (accessToken: string, categoryId: string): Promise<void> => {
    await apiNoContent(`/asset-categories/${categoryId}`, accessToken);
  },
  applyOperations: (
    accessToken: string,
    mapId: string,
    input: ApplyOperationsRequest,
  ): Promise<ApplyOperationsResponse> =>
    apiRequest(
      `/maps/${mapId}/operations`,
      applyOperationsResponseSchema,
      {
        method: 'POST',
        body: JSON.stringify(applyOperationsRequestSchema.parse(input)),
      },
      accessToken,
    ),
};

export async function fetchAssetBlob(
  accessToken: string,
  assetId: string,
  thumbnail = false,
): Promise<Blob> {
  const response = await fetch(
    `${apiBaseUrl}/assets/${assetId}/${thumbnail ? 'thumbnail' : 'content'}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!response.ok)
    throw new ApiError(`HTTP_${response.status}`, '素材图片加载失败。', response.status);
  return response.blob();
}

export function readableError(error: unknown): string {
  if (!(error instanceof ApiError)) return '出现了未预期的问题，请重试。';
  const messages: Record<string, string> = {
    INVALID_CREDENTIALS: '邮箱或密码不正确。',
    EMAIL_ALREADY_REGISTERED: '这个邮箱已经注册。',
    VALIDATION_FAILED: '请检查填写内容后再试。',
    RESOURCE_NOT_FOUND: '该内容不存在，或你没有访问权限。',
    REVISION_CONFLICT: '地图已在其他位置更新，请重新载入。',
    INVALID_ASSET_FILE: '图片格式、内容或尺寸不符合素材要求。',
    ASSET_IN_USE: '这个素材仍被地图或地点引用，暂时不能删除。',
    ASSET_CATEGORY_NAME_CONFLICT: '已有同名素材分类。',
  };
  return messages[error.code] ?? error.message;
}

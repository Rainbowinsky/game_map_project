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
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
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
};

export function readableError(error: unknown): string {
  if (!(error instanceof ApiError)) return '出现了未预期的问题，请重试。';
  const messages: Record<string, string> = {
    INVALID_CREDENTIALS: '邮箱或密码不正确。',
    EMAIL_ALREADY_REGISTERED: '这个邮箱已经注册。',
    VALIDATION_FAILED: '请检查填写内容后再试。',
    RESOURCE_NOT_FOUND: '该内容不存在，或你没有访问权限。',
    REVISION_CONFLICT: '地图已在其他位置更新，请重新载入。',
  };
  return messages[error.code] ?? error.message;
}

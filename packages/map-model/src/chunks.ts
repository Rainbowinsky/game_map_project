import { z } from 'zod';

import { mapObjectSchema } from './objects.js';
import {
  chunkCoordinateSchema,
  entityIdSchema,
  isoUtcDateTimeSchema,
  worldPointSchema,
  worldRectSchema,
  type ChunkCoordinate,
  type WorldPoint,
  type WorldRect,
} from './primitives.js';

export const SUPPORTED_CHUNK_SIZES = [512, 1_024] as const;
export const DEFAULT_CHUNK_SIZE = 1_024;
export const chunkSizeSchema = z.union([z.literal(512), z.literal(1_024)]);

export const mapChunkDescriptorSchema = z
  .object({
    id: entityIdSchema,
    mapId: entityIdSchema,
    coordinate: chunkCoordinateSchema,
    objectCount: z.number().int().safe().nonnegative(),
    revision: z.number().int().safe().nonnegative(),
    updatedAt: isoUtcDateTimeSchema,
  })
  .strict();

export const mapChunkPayloadSchema = mapChunkDescriptorSchema
  .extend({
    objects: z.array(mapObjectSchema).max(50_000),
  })
  .strict()
  .superRefine((payload, context) => {
    if (payload.objects.length !== payload.objectCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['objectCount'],
        message: 'objectCount must equal the number of objects in the payload.',
      });
    }

    payload.objects.forEach((object, index) => {
      if (object.mapId !== payload.mapId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['objects', index, 'mapId'],
          message: 'Chunk objects must belong to the descriptor map.',
        });
      }

      if (object.chunk.x !== payload.coordinate.x || object.chunk.y !== payload.coordinate.y) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['objects', index, 'chunk'],
          message: 'Chunk object coordinate must match the payload coordinate.',
        });
      }
    });
  });

export type MapChunkDescriptor = z.infer<typeof mapChunkDescriptorSchema>;
export type MapChunkPayload = z.infer<typeof mapChunkPayloadSchema>;

function parseChunkSize(chunkSize: number): number {
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
    throw new RangeError('Chunk size must be a positive safe integer.');
  }

  return chunkSize;
}

export function toChunkCoordinate(
  pointInput: WorldPoint,
  chunkSizeInput: number = DEFAULT_CHUNK_SIZE,
): ChunkCoordinate {
  const point = worldPointSchema.parse(pointInput);
  const chunkSize = parseChunkSize(chunkSizeInput);

  return chunkCoordinateSchema.parse({
    x: Math.floor(point.x / chunkSize),
    y: Math.floor(point.y / chunkSize),
  });
}

export function chunkKey(coordinateInput: ChunkCoordinate): string {
  const coordinate = chunkCoordinateSchema.parse(coordinateInput);
  return `${coordinate.x}:${coordinate.y}`;
}

export function parseChunkKey(key: string): ChunkCoordinate {
  const match = /^(-?\d+):(-?\d+)$/.exec(key);

  if (!match) {
    throw new TypeError('Invalid chunk key.');
  }

  return chunkCoordinateSchema.parse({
    x: Number(match[1]),
    y: Number(match[2]),
  });
}

export function chunkBounds(
  coordinateInput: ChunkCoordinate,
  chunkSizeInput: number = DEFAULT_CHUNK_SIZE,
): WorldRect {
  const coordinate = chunkCoordinateSchema.parse(coordinateInput);
  const chunkSize = parseChunkSize(chunkSizeInput);

  return worldRectSchema.parse({
    x: coordinate.x * chunkSize,
    y: coordinate.y * chunkSize,
    width: chunkSize,
    height: chunkSize,
  });
}

export function chunksIntersectingRect(
  rectInput: WorldRect,
  chunkSizeInput: number = DEFAULT_CHUNK_SIZE,
): ChunkCoordinate[] {
  const rect = worldRectSchema.parse(rectInput);
  const chunkSize = parseChunkSize(chunkSizeInput);
  const start = toChunkCoordinate({ x: rect.x, y: rect.y }, chunkSize);
  const end = chunkCoordinateSchema.parse({
    x: Math.ceil((rect.x + rect.width) / chunkSize) - 1,
    y: Math.ceil((rect.y + rect.height) / chunkSize) - 1,
  });
  const coordinates: ChunkCoordinate[] = [];

  for (let y = start.y; y <= end.y; y += 1) {
    for (let x = start.x; x <= end.x; x += 1) {
      coordinates.push({ x, y });
    }
  }

  return coordinates;
}

export const PNG_EXPORT_DEFAULT_LONG_EDGE = 2048;
export const PNG_EXPORT_CONFIGURED_MAX_LONG_EDGE = 4096;
export const PNG_EXPORT_MAX_PIXELS = 16_777_216;
const BYTES_PER_RGBA_PIXEL = 4;
const EXPORT_BUFFER_COUNT = 2;

export interface PngExportConstraints {
  readonly configuredMaxLongEdge?: number;
  readonly maxPixels?: number;
  readonly deviceMaxTextureSize?: number | null;
}

export interface PngExportPlan {
  readonly requestedLongEdge: number;
  readonly maxLongEdge: number;
  readonly outputWidth: number;
  readonly outputHeight: number;
  readonly pixelCount: number;
  readonly estimatedMemoryBytes: number;
  readonly scale: number;
  readonly wasReduced: boolean;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number.`);
  }
  return Math.max(1, Math.floor(value));
}

/**
 * Calculates an output size without ever using the world's dimensions as a
 * canvas size. The memory estimate accounts for both the RGBA render target
 * and the canvas/readback buffer used to produce the Blob.
 */
export function createPngExportPlan(
  worldWidth: number,
  worldHeight: number,
  requestedLongEdge = PNG_EXPORT_DEFAULT_LONG_EDGE,
  constraints: PngExportConstraints = {},
): PngExportPlan {
  const width = positiveInteger(worldWidth, 'World width');
  const height = positiveInteger(worldHeight, 'World height');
  const requested = positiveInteger(requestedLongEdge, 'Requested long edge');
  const configuredMax = positiveInteger(
    constraints.configuredMaxLongEdge ?? PNG_EXPORT_CONFIGURED_MAX_LONG_EDGE,
    'Configured maximum long edge',
  );
  const maxPixels = positiveInteger(
    constraints.maxPixels ?? PNG_EXPORT_MAX_PIXELS,
    'Maximum pixels',
  );
  const deviceMax = constraints.deviceMaxTextureSize;
  const deviceLimit =
    typeof deviceMax === 'number' && Number.isFinite(deviceMax) && deviceMax > 0
      ? Math.floor(deviceMax)
      : configuredMax;
  const maxLongEdge = Math.max(1, Math.min(configuredMax, deviceLimit));

  const worldLongEdge = Math.max(width, height);
  let scale = Math.min(maxLongEdge, requested) / worldLongEdge;
  let outputWidth = Math.max(1, Math.round(width * scale));
  let outputHeight = Math.max(1, Math.round(height * scale));
  let pixelCount = outputWidth * outputHeight;

  if (pixelCount > maxPixels) {
    scale *= Math.sqrt(maxPixels / pixelCount);
    outputWidth = Math.max(1, Math.floor(width * scale));
    outputHeight = Math.max(1, Math.floor(height * scale));
    pixelCount = outputWidth * outputHeight;
  }

  const outputLongEdge = Math.max(outputWidth, outputHeight);
  return {
    requestedLongEdge: requested,
    maxLongEdge,
    outputWidth,
    outputHeight,
    pixelCount,
    estimatedMemoryBytes: pixelCount * BYTES_PER_RGBA_PIXEL * EXPORT_BUFFER_COUNT,
    scale: Math.min(outputWidth / width, outputHeight / height),
    wasReduced: outputLongEdge < requested,
  };
}

export function pngLongEdgeOptions(maxLongEdge: number): readonly number[] {
  const safeMax = positiveInteger(maxLongEdge, 'Maximum long edge');
  return [...new Set([1024, PNG_EXPORT_DEFAULT_LONG_EDGE, safeMax])]
    .filter((value) => value <= safeMax)
    .sort((left, right) => left - right);
}

export function formatEstimatedBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '未知';
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MiB`;
}

/** Produces a portable, deterministic filename without user-supplied paths. */
export function safePngFilename(mapName: string): string {
  const normalized = mapName
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return `${normalized || 'fantasy-map'}.png`;
}

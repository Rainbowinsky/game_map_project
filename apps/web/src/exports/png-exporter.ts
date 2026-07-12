import {
  Assets,
  Container,
  Graphics,
  RenderTexture,
  Sprite,
  type Renderer,
  type Texture,
} from 'pixi.js';
import {
  isStampMapObject,
  type MapDocument,
  type MapLayer,
  type MapObject,
  type StampMapObject,
} from '@fantasy-map/map-model';

import { getStampAsset } from '../assets/stamp-assets.js';
import { drawMapArtwork } from '../renderer/map-artwork.js';
import { RendererProjection } from '../renderer/RendererProjection.js';
import {
  createPngExportPlan,
  safePngFilename,
  type PngExportConstraints,
  type PngExportPlan,
} from './png-export-plan.js';

export type PngExportErrorCode = 'ASSET_UNAVAILABLE' | 'BLOB_UNSUPPORTED' | 'EMPTY_BLOB';

export class PngExportError extends Error {
  constructor(
    readonly code: PngExportErrorCode,
    message: string,
    readonly assetIds: readonly string[] = [],
  ) {
    super(message);
    this.name = 'PngExportError';
  }
}

export interface PngExportResult {
  readonly blob: Blob;
  readonly filename: string;
  readonly plan: PngExportPlan;
}

export interface PngExportInput {
  readonly renderer: Renderer;
  readonly document: MapDocument;
  readonly layers: readonly MapLayer[];
  readonly objects: readonly MapObject[];
  readonly requestedLongEdge: number;
  readonly constraints?: PngExportConstraints;
}

interface BlobCanvas {
  toBlob?(callback: (blob: Blob | null) => void, type?: string): void;
  convertToBlob?(options?: { type?: string }): Promise<Blob>;
}

function applySpriteTransform(sprite: Sprite, object: StampMapObject): void {
  sprite.anchor.set(0.5);
  sprite.position.set(object.x, object.y);
  sprite.rotation = object.rotation;
  sprite.scale.set(
    object.scaleX * (object.flipX ? -1 : 1),
    object.scaleY * (object.flipY ? -1 : 1),
  );
  sprite.alpha = object.opacity;
  sprite.tint = object.tint ? Number.parseInt(object.tint.slice(1, 7), 16) : 0xffffff;
  sprite.zIndex = object.zIndex;
}

function effectivelyVisibleLayerIds(layers: readonly MapLayer[]): ReadonlySet<string> {
  const layersById = new Map(layers.map((layer) => [layer.id, layer]));
  const visible = new Set<string>();
  for (const layer of layers) {
    let current: MapLayer | undefined = layer;
    let isVisible = true;
    const visited = new Set<string>();
    while (current) {
      if (visited.has(current.id) || !current.visible) {
        isVisible = false;
        break;
      }
      visited.add(current.id);
      current = current.parentId ? layersById.get(current.parentId) : undefined;
    }
    if (isVisible) visible.add(layer.id);
  }
  return visible;
}

async function canvasToPngBlob(canvas: BlobCanvas): Promise<Blob> {
  if (canvas.convertToBlob) return canvas.convertToBlob({ type: 'image/png' });
  if (canvas.toBlob) {
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob?.((blob) => {
        if (blob) resolve(blob);
        else
          reject(
            new PngExportError('EMPTY_BLOB', '浏览器未能生成 PNG 文件，请降低导出尺寸后重试。'),
          );
      }, 'image/png');
    });
  }
  throw new PngExportError(
    'BLOB_UNSUPPORTED',
    '当前浏览器不支持将导出画布转换为 PNG 文件，请使用最新版桌面浏览器。',
  );
}

export async function loadExportTextures(
  objects: readonly MapObject[],
  loadTexture: (url: string) => Promise<Texture> = (url) => Assets.load<Texture>(url),
): Promise<Map<string, Texture>> {
  const requested = new Map<string, string>();
  const missing = new Set<string>();
  for (const object of objects.filter(isStampMapObject)) {
    const asset = getStampAsset(object.assetId);
    if (asset) requested.set(asset.id, asset.url);
    else missing.add(object.assetId);
  }

  const textures = new Map<string, Texture>();
  await Promise.all(
    [...requested].map(async ([assetId, url]) => {
      try {
        textures.set(assetId, await loadTexture(url));
      } catch {
        missing.add(assetId);
      }
    }),
  );
  if (missing.size > 0) {
    const ids = [...missing];
    throw new PngExportError(
      'ASSET_UNAVAILABLE',
      `以下图章资源尚未就绪，无法导出：${ids.join('、')}`,
      ids,
    );
  }
  return textures;
}

/**
 * Renders a fresh, export-only scene into a temporary RenderTexture. It never
 * reparents editor display objects or changes the live camera/selection state.
 */
export async function exportMapToPng({
  renderer,
  document,
  layers,
  objects,
  requestedLongEdge,
  constraints,
}: PngExportInput): Promise<PngExportResult> {
  const plan = createPngExportPlan(document.width, document.height, requestedLongEdge, constraints);
  const visibleLayerIds = effectivelyVisibleLayerIds(layers);
  const exportObjects = objects.filter(
    (object): object is StampMapObject =>
      isStampMapObject(object) && object.visible && visibleLayerIds.has(object.layerId),
  );
  const textures = await loadExportTextures(exportObjects);
  const scene = new Container();
  let renderTexture: RenderTexture | null = null;

  try {
    const background = new Graphics();
    const layerRoot = new Container();
    const boundary = new Graphics();
    const projection = new RendererProjection(layerRoot);
    drawMapArtwork(document, background, boundary);
    scene.addChild(background, layerRoot, boundary);
    projection.sync(layers);

    for (const object of exportObjects) {
      const parent = projection.getLayerContainer(object.layerId);
      const texture = textures.get(object.assetId);
      if (!parent || !texture) continue;
      const sprite = new Sprite(texture);
      applySpriteTransform(sprite, object);
      parent.addChild(sprite);
      parent.sortableChildren = true;
    }
    for (const layer of layers) projection.getLayerContainer(layer.id)?.sortChildren();

    // This camera is independent from the editor camera: world origin maps to
    // (0, 0), and the scale is determined solely by the safe output plan.
    scene.scale.set(plan.scale);
    renderTexture = RenderTexture.create({ width: plan.outputWidth, height: plan.outputHeight });
    renderer.render({ container: scene, target: renderTexture, clear: true, clearColor: 0x000000 });
    const canvas = renderer.extract.canvas({ target: renderTexture });
    const blob = await canvasToPngBlob(canvas);
    if (blob.size === 0) {
      throw new PngExportError('EMPTY_BLOB', '生成的 PNG 文件为空，请降低导出尺寸后重试。');
    }
    return { blob, filename: safePngFilename(document.name), plan };
  } finally {
    scene.destroy({ children: true, texture: false, textureSource: false, context: true });
    renderTexture?.destroy(true);
  }
}

export function rendererMaxTextureSize(renderer: Renderer): number | null {
  const gl = (renderer as Renderer & { gl?: WebGLRenderingContext | null }).gl;
  if (!gl) return null;
  const value = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** Starts a browser download and releases its temporary object URL immediately after use. */
export function downloadPngBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

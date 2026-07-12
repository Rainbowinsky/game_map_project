import { Graphics, Sprite, Texture, type Container } from 'pixi.js';
import {
  isStampMapObject,
  type MapObject,
  type ObjectTransform,
  type StampMapObject,
  type ThemeTokens,
  type WorldRect,
} from '@fantasy-map/map-model';

import { objectBounds, rectsIntersect } from '../editor/selection/geometry.js';
import type { AssetRegistry, TextureLease } from './AssetRegistry.js';
import type { RendererProjection } from './RendererProjection.js';
import { drawPath, drawRegion } from './geometry-render.js';

interface ObjectView {
  readonly display: Sprite | Graphics;
  readonly lease?: TextureLease;
  object: MapObject;
  disposed: boolean;
}

function applyTransform(
  sprite: Sprite,
  object: MapObject | ObjectTransform,
  source?: StampMapObject,
): void {
  sprite.position.set(object.x, object.y);
  sprite.rotation = object.rotation;
  const flipX = source?.flipX ?? ('flipX' in object && object.flipX);
  const flipY = source?.flipY ?? ('flipY' in object && object.flipY);
  sprite.scale.set(object.scaleX * (flipX ? -1 : 1), object.scaleY * (flipY ? -1 : 1));
}

/** Incrementally projects normalized stamp objects into their layer containers. */
export class ObjectProjection {
  private readonly views = new Map<string, ObjectView>();
  private objects = new Map<string, MapObject>();
  private visibleRect: WorldRect | null = null;
  private theme: ThemeTokens | null = null;

  constructor(
    private readonly layers: RendererProjection,
    private readonly assets: AssetRegistry,
  ) {}

  /**
   * All projections receive the resolved theme. Stamps deliberately retain
   * their existing texture and explicit-tint semantics, so no redraw is needed.
   */
  setTheme(tokens: ThemeTokens): void {
    if (tokens.allowedBlendModes.length === 0) {
      throw new Error('ObjectProjection requires a theme with at least one blend mode.');
    }
    this.theme = tokens;
    for (const view of this.views.values()) this.redraw(view);
  }

  sync(objects: readonly MapObject[]): void {
    const ids = new Set(objects.map((object) => object.id));
    for (const [objectId, view] of this.views) {
      if (!ids.has(objectId)) this.remove(objectId, view);
    }
    const projected = objects.filter(
      (object) => isStampMapObject(object) || object.type === 'path' || object.type === 'region',
    );
    this.objects = new Map(projected.map((object) => [object.id, object]));
    const sortTargets = new Set<Container>();
    for (const object of projected) this.upsertInto(object, sortTargets);
    this.sort(sortTargets);
  }

  /** Applies one committed object patch without rebuilding the full scene. */
  upsert(object: MapObject): void {
    if (!isStampMapObject(object) && object.type !== 'path' && object.type !== 'region') {
      this.removeObject(object.id);
      return;
    }
    this.objects.set(object.id, object);
    const sortTargets = new Set<Container>();
    this.upsertInto(object, sortTargets);
    this.sort(sortTargets);
  }

  removeObject(objectId: string): void {
    const view = this.views.get(objectId);
    if (view) this.remove(objectId, view);
    this.objects.delete(objectId);
  }

  preview(changesById: Readonly<Record<string, ObjectTransform>>): MapObject[] {
    const previewed: MapObject[] = [];
    for (const [objectId, transform] of Object.entries(changesById)) {
      const view = this.views.get(objectId);
      const object = this.objects.get(objectId);
      if (!view || !object) continue;
      if (!isStampMapObject(object) || !(view.display instanceof Sprite)) continue;
      applyTransform(view.display, transform, object);
      previewed.push({ ...object, ...transform });
    }
    return previewed;
  }

  clearPreview(): void {
    for (const view of this.views.values()) {
      if (isStampMapObject(view.object) && view.display instanceof Sprite) {
        applyTransform(view.display, view.object);
      }
    }
  }

  setVisibleRect(rect: WorldRect): void {
    this.visibleRect = rect;
    for (const view of this.views.values()) {
      const visible = view.object.visible && this.isInVisibleRect(view.object);
      if (view.display.visible !== visible) view.display.visible = visible;
    }
  }

  getVisibleObjectCount(): number {
    let count = 0;
    for (const view of this.views.values()) {
      if (view.display.visible && this.layers.isLayerEffectivelyVisible(view.object.layerId))
        count += 1;
    }
    return count;
  }

  destroy(): void {
    for (const [objectId, view] of this.views) this.remove(objectId, view);
    this.objects.clear();
  }

  private create(object: MapObject): ObjectView {
    if (!isStampMapObject(object)) {
      const display = new Graphics();
      display.eventMode = 'none';
      display.label = `object:${object.id}`;
      const view: ObjectView = { display, object, disposed: false };
      this.redraw(view);
      return view;
    }
    const lease = this.assets.acquire(object.assetId);
    const sprite = new Sprite(Texture.EMPTY);
    sprite.anchor.set(0.5);
    // Canvas-level pointer handling performs the editor's precise picking.
    // Disabling Pixi's per-sprite interaction walk keeps large stamp scenes
    // from paying a second hit-test cost for every pointer event.
    sprite.eventMode = 'none';
    sprite.label = `object:${object.id}`;
    const view: ObjectView = { display: sprite, lease, object, disposed: false };
    void lease.texture
      .then((texture) => {
        if (!view.disposed) sprite.texture = texture;
      })
      .catch(() => {
        // Keep an empty sprite; the editor remains usable and can retry after remount.
      });
    return view;
  }

  private upsertInto(object: MapObject, sortTargets: Set<Container>): void {
    let view = this.views.get(object.id);
    const kindChanged = view && view.object.type !== object.type;
    const assetChanged =
      view && isStampMapObject(view.object) && isStampMapObject(object)
        ? view.object.assetId !== object.assetId
        : false;
    if (!view || kindChanged || assetChanged) {
      if (view) this.remove(object.id, view);
      view = this.create(object);
      this.views.set(object.id, view);
    }
    view.object = object;
    const parent = this.layers.getLayerContainer(object.layerId);
    const previousParent = view.display.parent;
    if (parent && previousParent !== parent) {
      if (previousParent) sortTargets.add(previousParent);
      parent.addChild(view.display);
    } else if (!parent && previousParent) {
      previousParent.removeChild(view.display);
      sortTargets.add(previousParent);
    }
    if (isStampMapObject(object) && view.display instanceof Sprite) {
      applyTransform(view.display, object);
      view.display.alpha = object.opacity;
      view.display.tint = object.tint ? Number.parseInt(object.tint.slice(1, 7), 16) : 0xffffff;
    } else {
      this.redraw(view);
    }
    view.display.visible = object.visible && this.isInVisibleRect(object);
    view.display.zIndex = object.zIndex;
    if (parent) sortTargets.add(parent);
  }

  private sort(containers: ReadonlySet<Container>): void {
    for (const container of containers) {
      container.sortableChildren = true;
      container.sortChildren();
    }
  }

  private remove(objectId: string, view: ObjectView): void {
    view.disposed = true;
    view.display.removeFromParent();
    view.display.destroy({ texture: false, textureSource: false });
    view.lease?.release();
    this.views.delete(objectId);
  }

  private redraw(view: ObjectView): void {
    if (!this.theme || !(view.display instanceof Graphics)) return;
    if (view.object.type === 'path') drawPath(view.display, view.object, this.theme);
    else if (view.object.type === 'region') drawRegion(view.display, view.object, this.theme);
  }

  private isInVisibleRect(object: MapObject): boolean {
    return this.visibleRect === null || rectsIntersect(this.visibleRect, objectBounds(object));
  }
}

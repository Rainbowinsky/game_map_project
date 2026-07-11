import { Sprite, Texture, type Container } from 'pixi.js';
import type { MapObject, ObjectTransform, WorldRect } from '@fantasy-map/map-model';

import { objectBounds, rectsIntersect } from '../editor/selection/geometry.js';
import type { AssetRegistry, TextureLease } from './AssetRegistry.js';
import type { RendererProjection } from './RendererProjection.js';

interface ObjectView {
  readonly sprite: Sprite;
  readonly lease: TextureLease;
  object: MapObject;
  disposed: boolean;
}

function applyTransform(
  sprite: Sprite,
  object: MapObject | ObjectTransform,
  source?: MapObject,
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

  constructor(
    private readonly layers: RendererProjection,
    private readonly assets: AssetRegistry,
  ) {}

  sync(objects: readonly MapObject[]): void {
    const ids = new Set(objects.map((object) => object.id));
    for (const [objectId, view] of this.views) {
      if (!ids.has(objectId)) this.remove(objectId, view);
    }
    this.objects = new Map(objects.map((object) => [object.id, object]));
    const sortTargets = new Set<Container>();
    for (const object of objects) this.upsertInto(object, sortTargets);
    this.sort(sortTargets);
  }

  /** Applies one committed object patch without rebuilding the full scene. */
  upsert(object: MapObject): void {
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
      applyTransform(view.sprite, transform, object);
      previewed.push({ ...object, ...transform });
    }
    return previewed;
  }

  clearPreview(): void {
    for (const view of this.views.values()) applyTransform(view.sprite, view.object);
  }

  setVisibleRect(rect: WorldRect): void {
    this.visibleRect = rect;
    for (const view of this.views.values()) {
      const visible = view.object.visible && this.isInVisibleRect(view.object);
      if (view.sprite.visible !== visible) view.sprite.visible = visible;
    }
  }

  getVisibleObjectCount(): number {
    let count = 0;
    for (const view of this.views.values()) {
      if (view.sprite.visible && this.layers.isLayerEffectivelyVisible(view.object.layerId))
        count += 1;
    }
    return count;
  }

  destroy(): void {
    for (const [objectId, view] of this.views) this.remove(objectId, view);
    this.objects.clear();
  }

  private create(object: MapObject): ObjectView {
    const lease = this.assets.acquire(object.assetId);
    const sprite = new Sprite(Texture.EMPTY);
    sprite.anchor.set(0.5);
    // Canvas-level pointer handling performs the editor's precise picking.
    // Disabling Pixi's per-sprite interaction walk keeps large stamp scenes
    // from paying a second hit-test cost for every pointer event.
    sprite.eventMode = 'none';
    sprite.label = `object:${object.id}`;
    const view: ObjectView = { sprite, lease, object, disposed: false };
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
    if (!view || view.object.assetId !== object.assetId) {
      if (view) this.remove(object.id, view);
      view = this.create(object);
      this.views.set(object.id, view);
    }
    view.object = object;
    const parent = this.layers.getLayerContainer(object.layerId);
    const previousParent = view.sprite.parent;
    if (parent && previousParent !== parent) {
      if (previousParent) sortTargets.add(previousParent);
      parent.addChild(view.sprite);
    } else if (!parent && previousParent) {
      previousParent.removeChild(view.sprite);
      sortTargets.add(previousParent);
    }
    applyTransform(view.sprite, object);
    view.sprite.alpha = object.opacity;
    view.sprite.tint = object.tint ? Number.parseInt(object.tint.slice(1, 7), 16) : 0xffffff;
    view.sprite.visible = object.visible && this.isInVisibleRect(object);
    view.sprite.zIndex = object.zIndex;
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
    view.sprite.removeFromParent();
    view.sprite.destroy({ texture: false, textureSource: false });
    view.lease.release();
    this.views.delete(objectId);
  }

  private isInVisibleRect(object: MapObject): boolean {
    return this.visibleRect === null || rectsIntersect(this.visibleRect, objectBounds(object));
  }
}

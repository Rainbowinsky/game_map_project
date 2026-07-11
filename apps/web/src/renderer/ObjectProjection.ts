import { Sprite, Texture } from 'pixi.js';
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
    for (const object of objects) {
      let view = this.views.get(object.id);
      if (!view || view.object.assetId !== object.assetId) {
        if (view) this.remove(object.id, view);
        view = this.create(object);
        this.views.set(object.id, view);
      }
      view.object = object;
      const parent = this.layers.getLayerContainer(object.layerId);
      if (parent && view.sprite.parent !== parent) parent.addChild(view.sprite);
      applyTransform(view.sprite, object);
      view.sprite.alpha = object.opacity;
      view.sprite.tint = object.tint ? Number.parseInt(object.tint.slice(1, 7), 16) : 0xffffff;
      view.sprite.visible = object.visible && this.isInVisibleRect(object);
      view.sprite.zIndex = object.zIndex;
      if (parent) {
        parent.sortableChildren = true;
        parent.sortChildren();
      }
    }
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
      view.sprite.visible = view.object.visible && this.isInVisibleRect(view.object);
    }
  }

  destroy(): void {
    for (const [objectId, view] of this.views) this.remove(objectId, view);
    this.objects.clear();
  }

  private create(object: MapObject): ObjectView {
    const lease = this.assets.acquire(object.assetId);
    const sprite = new Sprite(Texture.EMPTY);
    sprite.anchor.set(0.5);
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

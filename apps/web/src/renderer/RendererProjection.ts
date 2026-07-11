import { Container } from 'pixi.js';
import type { BlendMode, MapLayer } from '@fantasy-map/map-model';

const blendModes: Record<BlendMode, BlendMode> = {
  normal: 'normal',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
};

/** Keeps Pixi layer containers aligned with the normalized document hierarchy. */
export class RendererProjection {
  private readonly containers = new Map<string, Container>();

  constructor(private readonly root: Container) {}

  sync(layers: readonly MapLayer[]): void {
    const layerIds = new Set(layers.map((layer) => layer.id));
    for (const [layerId, container] of this.containers) {
      if (!layerIds.has(layerId)) {
        container.removeFromParent();
        // Object sprites are owned by ObjectProjection and may be removed just
        // after their layer in the same patch batch; never destroy them here.
        container.removeChildren();
        container.destroy({ children: false });
        this.containers.delete(layerId);
      }
    }

    for (const layer of layers) {
      const container = this.containers.get(layer.id) ?? new Container();
      container.label = `layer:${layer.id}`;
      container.visible = layer.visible;
      container.alpha = layer.opacity;
      container.blendMode = blendModes[layer.blendMode];
      this.containers.set(layer.id, container);
    }

    const parents = new Map<string | null, MapLayer[]>();
    for (const layer of layers) {
      const siblings = parents.get(layer.parentId) ?? [];
      siblings.push(layer);
      parents.set(layer.parentId, siblings);
    }
    for (const siblings of parents.values()) siblings.sort((a, b) => a.order - b.order);

    const attach = (parentId: string | null, parent: Container) => {
      for (const layer of parents.get(parentId) ?? []) {
        const container = this.containers.get(layer.id);
        if (!container) continue;
        parent.addChild(container);
        attach(layer.id, container);
      }
    };
    attach(null, this.root);
  }

  getLayerContainer(layerId: string): Container | undefined {
    return this.containers.get(layerId);
  }
}

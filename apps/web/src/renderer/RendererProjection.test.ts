import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { createMapDocumentFixture } from '@fantasy-map/map-model/fixtures';
import type { MapLayer } from '@fantasy-map/map-model';

import { RendererProjection } from './RendererProjection.js';

describe('RendererProjection', () => {
  it('projects order, visibility, opacity, blend mode and deletion', () => {
    const root = new Container();
    const projection = new RendererProjection(root);
    const document = createMapDocumentFixture();
    projection.sync(document.layers);

    expect(root.children.map((child) => child.label)).toEqual(
      [...document.layers].sort((a, b) => a.order - b.order).map((layer) => `layer:${layer.id}`),
    );

    const changed: MapLayer = {
      ...document.layers[1]!,
      visible: false,
      opacity: 0.35,
      blendMode: 'multiply',
    };
    projection.sync([changed]);
    const container = projection.getLayerContainer(changed.id);
    expect(container).toMatchObject({ visible: false, alpha: 0.35, blendMode: 'multiply' });
    expect(projection.isLayerEffectivelyVisible(changed.id)).toBe(false);
    expect(projection.getLayerContainer(document.layers[0]!.id)).toBeUndefined();
    root.destroy({ children: true });
  });

  it('nests child containers under group containers', () => {
    const root = new Container();
    const projection = new RendererProjection(root);
    const document = createMapDocumentFixture();
    const group: MapLayer = {
      ...document.layers[1]!,
      id: '10000000-0000-4000-8000-000000000010',
      type: 'group',
      order: 0,
    };
    const child = { ...document.layers[1]!, parentId: group.id, order: 0 };
    projection.sync([group, child]);

    expect(projection.getLayerContainer(group.id)?.children).toEqual([
      projection.getLayerContainer(child.id),
    ]);
    expect(projection.isLayerEffectivelyVisible(child.id)).toBe(true);
    root.destroy({ children: true });
  });
});

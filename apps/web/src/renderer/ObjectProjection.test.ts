import { Container, Text, Texture } from 'pixi.js';
import type { MapObject } from '@fantasy-map/map-model';
import {
  createMapDocumentFixture,
  createPathMapObjectFixture,
  createTextMapObjectFixture,
} from '@fantasy-map/map-model/fixtures';
import { describe, expect, it, vi } from 'vitest';

import { STAMP_ASSETS } from '../assets/stamp-assets.js';
import type { AssetRegistry } from './AssetRegistry.js';
import { ObjectProjection } from './ObjectProjection.js';
import { RendererProjection } from './RendererProjection.js';
import { themeRegistry } from '../themes/ThemeRegistry.js';

function object(id: string, x: number, zIndex = 0): MapObject {
  const document = createMapDocumentFixture();
  return {
    id,
    mapId: document.id,
    layerId: document.layers[1]!.id,
    chunk: { x: 0, y: 0 },
    type: 'stamp',
    name: `Stamp ${id}`,
    x,
    y: 120,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    zIndex,
    visible: true,
    locked: false,
    opacity: 1,
    metadata: {},
    revision: 0,
    assetId: STAMP_ASSETS[0]!.id,
    stampKind: 'mountain',
    tint: null,
    flipX: false,
    flipY: false,
    randomSeed: 1,
    createdAt: '2026-07-12T00:00:00.000Z',
    updatedAt: '2026-07-12T00:00:00.000Z',
  };
}

function assets(): AssetRegistry {
  return {
    acquire: () => ({ texture: Promise.resolve(Texture.EMPTY), release: vi.fn() }),
  } as unknown as AssetRegistry;
}

describe('ObjectProjection', () => {
  it('updates one object incrementally and culls only changed visibility flags', () => {
    const root = new Container();
    const layers = new RendererProjection(root);
    const document = createMapDocumentFixture();
    layers.sync(document.layers);
    const projection = new ObjectProjection(layers, assets());
    const first = object('00000000-0000-4000-8000-000000000001', 100, 2);
    const second = object('00000000-0000-4000-8000-000000000002', 800, 1);

    projection.sync([first, second]);
    projection.setVisibleRect({ x: 0, y: 0, width: 300, height: 300 });
    expect(projection.getVisibleObjectCount()).toBe(1);

    const container = layers.getLayerContainer(first.layerId);
    expect(container?.children.map((child) => child.label)).toEqual([
      `object:${second.id}`,
      `object:${first.id}`,
    ]);

    projection.upsert({ ...second, x: 180, zIndex: 3 });
    expect(projection.getVisibleObjectCount()).toBe(2);
    expect(container?.children.map((child) => child.label)).toEqual([
      `object:${first.id}`,
      `object:${second.id}`,
    ]);

    projection.removeObject(first.id);
    expect(container?.children.map((child) => child.label)).toEqual([`object:${second.id}`]);
    root.destroy({ children: true });
  });

  it('projects path graphics into their semantic layer and redraws them with theme tokens', () => {
    const root = new Container();
    const layers = new RendererProjection(root);
    const document = createMapDocumentFixture();
    const path = createPathMapObjectFixture();
    const source = document.layers[1]!;
    const pathLayer = { ...source, id: path.layerId, type: 'vector-path' as const, order: 2 };
    layers.sync([...document.layers, pathLayer]);
    const projection = new ObjectProjection(layers, assets());

    projection.setTheme(themeRegistry.resolve('mvp-classic').tokens);
    projection.sync([path]);
    expect(layers.getLayerContainer(path.layerId)?.children.map((child) => child.label)).toEqual([
      `object:${path.id}`,
    ]);
    expect(projection.getVisibleObjectCount()).toBe(1);

    projection.setTheme(themeRegistry.resolve('mvp-sunlit-atlas').tokens);
    projection.removeObject(path.id);
    expect(layers.getLayerContainer(path.layerId)?.children).toHaveLength(0);
    root.destroy({ children: true });
  });

  it('leaves mounted canvas text to the Application-owned display-tree teardown', () => {
    const root = new Container();
    const layers = new RendererProjection(root);
    const document = createMapDocumentFixture();
    const text = createTextMapObjectFixture();
    const source = document.layers[1]!;
    const textLayer = { ...source, id: text.layerId, type: 'text' as const, order: 2 };
    layers.sync([...document.layers, textLayer]);
    const projection = new ObjectProjection(layers, assets());

    projection.setTheme(themeRegistry.resolve('mvp-classic').tokens);
    projection.sync([text]);
    const destroy = vi.spyOn(Text.prototype, 'destroy');
    projection.destroy();

    expect(destroy).not.toHaveBeenCalled();
    root.destroy({ children: true });
    destroy.mockRestore();
  });
});

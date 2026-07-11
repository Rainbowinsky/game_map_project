import { Container, Texture } from 'pixi.js';
import { createMapDocumentFixture } from '@fantasy-map/map-model/fixtures';
import { bench, describe } from 'vitest';

import type { AssetRegistry } from '../renderer/AssetRegistry.js';
import { ObjectProjection } from '../renderer/ObjectProjection.js';
import { RendererProjection } from '../renderer/RendererProjection.js';
import { createStampBenchmarkObjects, STAMP_BENCHMARK_COUNTS } from './stamp-benchmark.js';

const assets = {
  acquire: () => ({ texture: Promise.resolve(Texture.EMPTY), release: () => undefined }),
} as unknown as AssetRegistry;

describe('deterministic stamp projection', () => {
  for (const count of STAMP_BENCHMARK_COUNTS) {
    const root = new Container();
    const layers = new RendererProjection(root);
    const document = createMapDocumentFixture();
    const stampLayer = document.layers[1]!;
    layers.sync([{ ...stampLayer, id: '30000000-0000-4000-8000-000000000002' }]);
    const projection = new ObjectProjection(layers, assets);
    const objects = createStampBenchmarkObjects(count);
    projection.sync(objects);

    bench(`${count.toLocaleString()} stamps: cull and update one object`, () => {
      projection.setVisibleRect({ x: 10_000, y: 10_000, width: 1_920, height: 1_080 });
      projection.upsert({ ...objects[0]!, x: 12_000, y: 12_000, zIndex: count + 1 });
    });
  }
});

import { createMapDocumentFixture } from '@fantasy-map/map-model/fixtures';
import { bench, describe } from 'vitest';

import {
  createMinimapViewport,
  minimapCameraRect,
  worldToMinimap,
} from '../editor/minimap/minimap-projection.js';
import { createGeometryBenchmarkObjects, GEOMETRY_BENCHMARK_COUNTS } from './geometry-benchmark.js';

describe('deterministic minimap projection', () => {
  const document = createMapDocumentFixture();
  const viewport = createMinimapViewport(document, { width: 220, height: 148 });
  for (const count of GEOMETRY_BENCHMARK_COUNTS) {
    const objects = createGeometryBenchmarkObjects(count);
    bench(`${count.toLocaleString()} geometries: project overview and viewport`, () => {
      for (const object of objects) {
        if (object.type === 'path')
          object.nodes.forEach((node) => worldToMinimap(node.anchor, viewport));
        else if (object.type === 'region')
          object.vertices.forEach((point) => worldToMinimap(point, viewport));
        else if (object.type === 'terrain-stroke')
          object.points.forEach((point) => worldToMinimap(point, viewport));
        else worldToMinimap(object, viewport);
      }
      minimapCameraRect(
        { x: 50_000, y: 40_000, zoom: 0.5 },
        { width: 1_920, height: 1_080 },
        document,
      );
    });
  }
});

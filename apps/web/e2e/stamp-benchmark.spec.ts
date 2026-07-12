import { expect, test, type Page } from '@playwright/test';

import {
  createStampBenchmarkObjects,
  STAMP_BENCHMARK_COUNTS,
} from '../src/performance/stamp-benchmark.js';

const ids = {
  user: '70000000-0000-4000-8000-000000000101',
  project: '70000000-0000-4000-8000-000000000102',
  map: '70000000-0000-4000-8000-000000000103',
  layer: '70000000-0000-4000-8000-000000000104',
  chunk: '70000000-0000-4000-8000-000000000105',
};

const timestamp = '2026-07-12T00:00:00.000Z';

function document() {
  return {
    schemaVersion: 2,
    id: ids.map,
    projectId: ids.project,
    name: 'Projection benchmark',
    width: 24_000,
    height: 16_000,
    themeId: 'mvp-classic',
    background: { kind: 'solid', color: '#17324D' },
    settings: {
      chunkSize: 1024,
      worldUnit: 'kilometer',
      grid: { enabled: true, size: 100, snap: false },
      camera: { minZoom: 0.02, maxZoom: 16 },
    },
    layers: [
      {
        id: ids.layer,
        mapId: ids.map,
        parentId: null,
        name: 'Benchmarks',
        type: 'stamp',
        order: 0,
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    revision: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function prepareBenchmark(page: Page, count: number): Promise<void> {
  const objects = createStampBenchmarkObjects(count, {
    mapId: ids.map,
    layerId: ids.layer,
    // Keeping all benchmark stamps in one Chunk makes network work constant;
    // the recorded measurement is projection/culling rather than fetch fan-out.
    width: 800,
    height: 800,
  });
  await page.addInitScript(
    (session) => sessionStorage.setItem('atlas-session-v1', JSON.stringify(session)),
    {
      user: {
        id: ids.user,
        email: 'benchmark@example.com',
        displayName: 'Benchmark',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      accessToken: 'a'.repeat(48),
      tokenType: 'Bearer',
      expiresIn: 900,
    },
  );
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = {};
    if (route.request().method() === 'GET' && path.endsWith(`/maps/${ids.map}`)) {
      data = document();
    } else if (route.request().method() === 'GET' && path.endsWith('/chunks')) {
      data = {
        items: [
          {
            id: ids.chunk,
            mapId: ids.map,
            coordinate: { x: 0, y: 0 },
            objectCount: objects.length,
            revision: 0,
            updatedAt: timestamp,
          },
        ],
        nextCursor: null,
      };
    } else if (route.request().method() === 'GET' && path.endsWith('/chunks/0/0')) {
      data = {
        id: ids.chunk,
        mapId: ids.map,
        coordinate: { x: 0, y: 0 },
        objectCount: objects.length,
        revision: 0,
        updatedAt: timestamp,
        objects,
      };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data, meta: { requestId: 'benchmark-request' } }),
    });
  });
}

for (const count of STAMP_BENCHMARK_COUNTS) {
  test(`projects ${count.toLocaleString()} deterministic stamps @benchmark`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    await prepareBenchmark(page, count);
    const startedAt = performance.now();
    await page.goto(`/editor/${ids.map}`);
    await expect(page.getByTestId('pixi-host').locator('canvas')).toHaveCount(1);
    await expect(page.getByTestId('visible-object-count')).toContainText(
      new RegExp(`${count.toLocaleString()}\\s*/\\s*${count.toLocaleString()}`),
    );

    const elapsedMs = Math.round(performance.now() - startedAt);
    const rendererFps = await page.getByTestId('renderer-fps').textContent();
    const memory = await page.evaluate(() => {
      const performanceWithMemory = performance as Performance & {
        memory?: { usedJSHeapSize?: number };
      };
      return performanceWithMemory.memory?.usedJSHeapSize ?? null;
    });
    await testInfo.attach(`stamp-benchmark-${count}.json`, {
      body: JSON.stringify(
        {
          scenario: `${count} deterministic stamps`,
          elapsedMs,
          rendererFps,
          visibleObjects: count,
          totalObjects: count,
          usedJsHeapBytes: memory,
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
  });
}

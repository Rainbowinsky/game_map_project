import { expect, test, type Page } from '@playwright/test';

const ids = {
  user: '70000000-0000-4000-8000-000000000001',
  project: '70000000-0000-4000-8000-000000000002',
  map: '70000000-0000-4000-8000-000000000003',
  layer: '70000000-0000-4000-8000-000000000004',
  map2: '70000000-0000-4000-8000-000000000005',
  chunk: '70000000-0000-4000-8000-000000000006',
};

const timestamp = '2026-07-11T12:00:00.000Z';
const session = {
  user: {
    id: ids.user,
    email: 'cartographer@example.com',
    displayName: '林远',
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  accessToken: 'a'.repeat(48),
  tokenType: 'Bearer',
  expiresIn: 900,
};
const mapDocument = (id = ids.map, name = '灰烬海岸', revision = 0) => ({
  schemaVersion: 1,
  id,
  projectId: ids.project,
  name,
  width: 24000,
  height: 16000,
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
      mapId: id,
      parentId: null,
      name: 'Landmarks',
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
  revision,
  createdAt: timestamp,
  updatedAt: timestamp,
});

async function prepare(page: Page) {
  let revision = 0;
  let offline = false;
  let savedObjects: Array<Record<string, unknown>> = [];
  const receipts = new Map<string, Record<string, unknown>>();
  await page.addInitScript(
    (value) => sessionStorage.setItem('atlas-session-v1', JSON.stringify(value)),
    session,
  );
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    let data: unknown = {};
    if (method === 'POST' && path.endsWith(`/maps/${ids.map}/operations`)) {
      if (offline) return route.abort('internetdisconnected');
      const input = route.request().postDataJSON() as {
        baseRevision: number;
        clientMutationId: string;
        operations: Array<Record<string, unknown>>;
      };
      const receipt = receipts.get(input.clientMutationId);
      if (receipt) data = receipt;
      else if (input.baseRevision !== revision) {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'REVISION_CONFLICT', message: 'Map revision conflict.' },
          }),
        });
      } else {
        for (const operation of input.operations) {
          if (operation.type === 'object.create') {
            const object = operation.object as Record<string, unknown>;
            const x = Number(object.x);
            const y = Number(object.y);
            savedObjects.push({
              ...object,
              mapId: ids.map,
              chunk: { x: Math.floor(x / 1024), y: Math.floor(y / 1024) },
              revision: 1,
              createdAt: timestamp,
              updatedAt: timestamp,
            });
          } else if (operation.type === 'object.update') {
            savedObjects = savedObjects.map((object) => {
              if (object.id !== operation.objectId) return object;
              const changed = { ...object, ...(operation.changes as object), updatedAt: timestamp };
              return {
                ...changed,
                chunk: {
                  x: Math.floor(Number(changed.x) / 1024),
                  y: Math.floor(Number(changed.y) / 1024),
                },
              };
            });
          } else if (operation.type === 'object.delete') {
            savedObjects = savedObjects.filter((object) => object.id !== operation.objectId);
          }
        }
        const previousRevision = revision;
        revision += 1;
        data = {
          mapId: ids.map,
          acceptedMutationId: input.clientMutationId,
          previousRevision,
          revision,
          updatedAt: timestamp,
          changedChunkKeys: [],
        };
        receipts.set(input.clientMutationId, data as Record<string, unknown>);
      }
    } else if (method === 'GET' && path.endsWith('/projects'))
      data = {
        items: [
          {
            id: ids.project,
            name: '北境编年史',
            description: null,
            createdAt: timestamp,
            updatedAt: timestamp,
            maps: [{ id: ids.map, name: '灰烬海岸', revision: 0, updatedAt: timestamp }],
          },
        ],
        nextCursor: null,
      };
    else if (method === 'POST' && path.endsWith('/projects'))
      data = {
        id: ids.project,
        name: '新世界',
        description: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        maps: [],
      };
    else if (method === 'POST' && path.includes(`/projects/${ids.project}/maps`))
      data = mapDocument(ids.map2, '群星内海');
    else if (method === 'GET' && path.match(/\/maps\/[^/]+$/))
      data = mapDocument(
        path.endsWith(ids.map2) ? ids.map2 : ids.map,
        path.endsWith(ids.map2) ? '群星内海' : '灰烬海岸',
        path.endsWith(ids.map2) ? 0 : revision,
      );
    else if (method === 'GET' && path.endsWith('/chunks')) {
      const chunks = new Map<string, Record<string, unknown>>();
      for (const object of savedObjects) {
        const coordinate = object.chunk as { x: number; y: number };
        const key = `${coordinate.x}:${coordinate.y}`;
        const existing = chunks.get(key);
        if (existing) existing.objectCount = Number(existing.objectCount) + 1;
        else
          chunks.set(key, {
            id: ids.chunk,
            mapId: ids.map,
            coordinate,
            objectCount: 1,
            revision,
            updatedAt: timestamp,
          });
      }
      data = { items: [...chunks.values()], nextCursor: null };
    } else if (method === 'GET' && path.match(/\/chunks\/-?\d+\/-?\d+$/)) {
      const parts = path.split('/');
      const coordinate = { x: Number(parts.at(-2)), y: Number(parts.at(-1)) };
      const objects = savedObjects.filter((object) => {
        const chunk = object.chunk as { x: number; y: number };
        return chunk.x === coordinate.x && chunk.y === coordinate.y;
      });
      data = {
        id: ids.chunk,
        mapId: ids.map,
        coordinate,
        objectCount: objects.length,
        revision,
        updatedAt: timestamp,
        objects,
      };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data, meta: { requestId: 'e2e-request' } }),
    });
  });
  return { setOffline: (value: boolean) => (offline = value) };
}

test('opens a recent map and restores the editor route after refresh', async ({ page }) => {
  await prepare(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '地图室' })).toBeVisible();
  await page.getByRole('link', { name: /灰烬海岸/ }).click();
  await expect(page.getByRole('heading', { name: '灰烬海岸' })).toBeVisible();
  await expect(page.getByText('图章素材', { exact: true })).toBeVisible();
  await expect(page.getByTestId('pixi-host').locator('canvas')).toHaveCount(1);
  const canvas = page.getByTestId('pixi-host');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Map canvas has no visible bounds.');
  await page.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + bounds.height * 0.45);
  const cameraStatus = page.getByTestId('camera-zoom');
  await expect(cameraStatus).not.toHaveText('ZOOM 100%');
  const exactZoomBefore = await cameraStatus.getAttribute('data-camera-zoom');
  await canvas.dispatchEvent('wheel', {
    deltaY: -300,
    clientX: bounds.x + bounds.width * 0.7,
    clientY: bounds.y + bounds.height * 0.45,
  });
  await expect(cameraStatus).not.toHaveAttribute('data-camera-zoom', exactZoomBefore ?? '');
  await page.getByRole('button', { name: '平移' }).click();
  await expect(canvas).toHaveClass(/is-pan-tool/);
  await canvas.dispatchEvent('pointerdown', {
    button: 0,
    pointerId: 1,
    clientX: bounds.x + bounds.width * 0.7,
    clientY: bounds.y + bounds.height * 0.45,
  });
  await expect(canvas).toHaveClass(/is-panning/);
  await canvas.dispatchEvent('pointermove', {
    button: 0,
    pointerId: 1,
    movementX: -80,
    movementY: 60,
    clientX: bounds.x + bounds.width * 0.6,
    clientY: bounds.y + bounds.height * 0.55,
  });
  await canvas.dispatchEvent('pointerup', {
    button: 0,
    pointerId: 1,
    clientX: bounds.x + bounds.width * 0.6,
    clientY: bounds.y + bounds.height * 0.55,
  });
  await expect(canvas).not.toHaveClass(/is-panning/);
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/editor/${ids.map}$`));
  await expect(page.getByRole('heading', { name: '灰烬海岸' })).toBeVisible();
});

test('exports a complete-map PNG with a safe preview resolution', async ({ page }) => {
  await prepare(page);
  await page.goto(`/editor/${ids.map}`);
  await expect(page.getByTestId('pixi-host').locator('canvas')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '导出' })).toBeEnabled();
  await page.getByRole('button', { name: '导出' }).click();
  await expect(page.getByRole('dialog', { name: '导出整张地图' })).toBeVisible();
  await expect(page.getByLabel('安全输出长边')).toHaveValue('2048');
  await expect(page.getByTestId('export-dimensions')).toContainText('2,048 × 1,365 px');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '生成并下载 PNG' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.png$/i);
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Expected an exported PNG download stream.');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const signature = Buffer.concat(chunks).subarray(0, 8);
  expect([...signature]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

  await expect(page.getByRole('dialog', { name: '导出整张地图' })).toBeHidden();
  const secondDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出' }).click();
  await page.getByRole('button', { name: '生成并下载 PNG' }).click();
  const secondDownload = await secondDownloadPromise;
  expect((await secondDownload.createReadStream())?.readable).toBeTruthy();
});

test('places, selects, transforms, duplicates and deletes a stamp', async ({ page }) => {
  await prepare(page);
  await page.goto(`/editor/${ids.map}`);
  await expect(page.getByTestId('pixi-host').locator('canvas')).toHaveCount(1);
  const canvas = page.getByTestId('pixi-host');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Map canvas has no visible bounds.');
  const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };

  await page.getByRole('button', { name: /远峰/ }).click();
  await canvas.dispatchEvent('pointerdown', {
    button: 0,
    pointerId: 2,
    clientX: point.x,
    clientY: point.y,
  });
  await expect(page.getByText('1 个对象', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '选择' }).click();
  await canvas.dispatchEvent('pointerdown', {
    button: 0,
    pointerId: 3,
    clientX: point.x,
    clientY: point.y,
  });
  await canvas.dispatchEvent('pointermove', {
    button: 0,
    pointerId: 3,
    clientX: point.x + 60,
    clientY: point.y + 30,
  });
  await canvas.dispatchEvent('pointerup', {
    button: 0,
    pointerId: 3,
    clientX: point.x + 60,
    clientY: point.y + 30,
  });
  await expect(page.getByRole('button', { name: '撤销' })).toBeEnabled();

  await page.getByRole('button', { name: '属性', exact: true }).click();
  await expect(page.getByRole('heading', { name: '远峰' })).toBeVisible();
  await page.keyboard.press('Control+d');
  await expect(page.getByText('2 个对象', { exact: true })).toBeVisible();
  await page.keyboard.press('Delete');
  await expect(page.getByText('1 个对象', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '撤销' }).click();
  await expect(page.getByText('2 个对象', { exact: true })).toBeVisible();
  await expect(page.getByTestId('save-status')).toContainText('已保存');
});

test('recovers an offline edit from IndexedDB and saves it after reload', async ({ page }) => {
  const network = await prepare(page);
  network.setOffline(true);
  await page.goto(`/editor/${ids.map}`);
  await expect(page.getByTestId('pixi-host').locator('canvas')).toHaveCount(1);
  const canvas = page.getByTestId('pixi-host');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Map canvas has no visible bounds.');

  await page.getByRole('button', { name: /远峰/ }).click();
  await canvas.dispatchEvent('pointerdown', {
    button: 0,
    pointerId: 9,
    clientX: bounds.x + bounds.width / 2,
    clientY: bounds.y + bounds.height / 2,
  });
  await expect(page.getByTestId('save-status')).toContainText('离线');

  network.setOffline(false);
  await page.reload();
  await expect(page.getByRole('dialog')).toContainText('尚未提交');
  await page.getByRole('button', { name: '恢复更改' }).click();
  await expect(page.getByTestId('save-status')).toContainText('已保存');
  await page.reload();
  await expect(page.getByText('1 个对象', { exact: true })).toBeVisible();
});

test('creates a project and map through the animated dialog', async ({ page }) => {
  await prepare(page);
  await page.goto('/');
  await page.getByRole('button', { name: '创建新世界' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('项目名称').fill('群星编年史');
  await page.getByLabel('地图名称').fill('群星内海');
  await page.getByRole('button', { name: /创建并打开/ }).click();
  await expect(page).toHaveURL(new RegExp(`/editor/${ids.map2}$`));
  await expect(page.getByRole('heading', { name: '群星内海' })).toBeVisible();
});

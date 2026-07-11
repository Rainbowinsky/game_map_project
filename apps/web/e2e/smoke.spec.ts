import { expect, test, type Page } from '@playwright/test';

const ids = {
  user: '70000000-0000-4000-8000-000000000001',
  project: '70000000-0000-4000-8000-000000000002',
  map: '70000000-0000-4000-8000-000000000003',
  layer: '70000000-0000-4000-8000-000000000004',
  map2: '70000000-0000-4000-8000-000000000005',
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
const mapDocument = (id = ids.map, name = '灰烬海岸') => ({
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
  revision: 0,
  createdAt: timestamp,
  updatedAt: timestamp,
});

async function prepare(page: Page) {
  await page.addInitScript(
    (value) => sessionStorage.setItem('atlas-session-v1', JSON.stringify(value)),
    session,
  );
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    let data: unknown = {};
    if (method === 'GET' && path.endsWith('/projects'))
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
      );
    else if (method === 'GET' && path.endsWith('/chunks')) data = { items: [], nextCursor: null };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data, meta: { requestId: 'e2e-request' } }),
    });
  });
}

test('opens a recent map and restores the editor route after refresh', async ({ page }) => {
  await prepare(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '地图室' })).toBeVisible();
  await page.getByRole('link', { name: /灰烬海岸/ }).click();
  await expect(page.getByRole('heading', { name: '灰烬海岸' })).toBeVisible();
  await expect(page.getByText('素材', { exact: true })).toBeVisible();
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

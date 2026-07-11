import { describe, expect, it } from 'vitest';
import { createStampMapObjectFixture } from '@fantasy-map/map-model/fixtures';
import type { Texture } from 'pixi.js';

import { STAMP_ASSETS } from '../assets/stamp-assets.js';
import { loadExportTextures } from './png-exporter.js';

describe('loadExportTextures', () => {
  it('reports unavailable assets before an export scene is allocated', async () => {
    const assetId = STAMP_ASSETS[0]!.id;
    const object = { ...createStampMapObjectFixture(), assetId };

    await expect(
      loadExportTextures([object], async () => Promise.reject(new Error('unavailable'))),
    ).rejects.toMatchObject({
      code: 'ASSET_UNAVAILABLE',
      assetIds: [assetId],
    });
  });

  it('loads each shared resource only once', async () => {
    const assetId = STAMP_ASSETS[0]!.id;
    const first = {
      ...createStampMapObjectFixture(),
      id: '10000000-0000-4000-8000-000000000051',
      assetId,
    };
    const second = { ...first, id: '10000000-0000-4000-8000-000000000052' };
    const texture = {} as Texture;
    const loaded = await loadExportTextures([first, second], async () => texture);

    expect(loaded.get(assetId)).toBe(texture);
    expect(loaded.size).toBe(1);
  });
});

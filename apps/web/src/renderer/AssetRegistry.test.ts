import { describe, expect, it, vi } from 'vitest';
import type { Texture } from 'pixi.js';

import { STAMP_ASSETS } from '../assets/stamp-assets.js';
import { AssetRegistry } from './AssetRegistry.js';

describe('AssetRegistry', () => {
  it('shares a texture and does not destroy it when one object releases its lease', async () => {
    const destroy = vi.fn();
    const texture = { destroy } as unknown as Texture;
    const load = vi.fn(async () => texture);
    const registry = new AssetRegistry(load);
    const assetId = STAMP_ASSETS[0]!.id;

    const first = registry.acquire(assetId);
    const second = registry.acquire(assetId);
    expect(await first.texture).toBe(await second.texture);
    expect(load).toHaveBeenCalledTimes(1);
    expect(registry.getReferenceCount(assetId)).toBe(2);

    first.release();
    expect(registry.getReferenceCount(assetId)).toBe(1);
    expect(destroy).not.toHaveBeenCalled();

    second.release();
    registry.destroy();
    await Promise.resolve();
    expect(destroy).toHaveBeenCalledOnce();
  });
});

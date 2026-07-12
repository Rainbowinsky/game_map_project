import { Assets, type Texture } from 'pixi.js';

import { STAMP_ASSETS } from '../assets/stamp-assets.js';
import { fetchAssetBlob } from '../services/api-client.js';
import { useSessionStore } from '../stores/session-store.js';

interface AssetEntry {
  readonly texture: Promise<Texture>;
  references: number;
}

export interface TextureLease {
  readonly texture: Promise<Texture>;
  release(): void;
}

/** Owns one shared texture promise per built-in or authenticated custom asset. */
export class AssetRegistry {
  private readonly entries = new Map<string, AssetEntry>();
  private destroyed = false;

  constructor(
    private readonly loadTexture: (url: string) => Promise<Texture> = (url) =>
      Assets.load<Texture>(url),
  ) {}

  acquire(assetId: string): TextureLease {
    if (this.destroyed) throw new Error('AssetRegistry has been destroyed.');
    let entry = this.entries.get(assetId);
    if (!entry) {
      entry = { texture: this.loadAsset(assetId), references: 0 };
      this.entries.set(assetId, entry);
    }
    entry.references += 1;
    let released = false;
    return {
      texture: entry.texture,
      release: () => {
        if (released) return;
        released = true;
        entry.references = Math.max(0, entry.references - 1);
      },
    };
  }

  private async loadAsset(assetId: string): Promise<Texture> {
    const definition = STAMP_ASSETS.find((asset) => asset.id === assetId);
    if (definition) return this.loadTexture(definition.url);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assetId))
      throw new Error(`Unknown asset ${assetId}.`);
    const accessToken = useSessionStore.getState().session?.accessToken;
    if (!accessToken) throw new Error('An authenticated session is required to load this asset.');
    const objectUrl = URL.createObjectURL(await fetchAssetBlob(accessToken, assetId));
    try {
      return await this.loadTexture(objectUrl);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  getReferenceCount(assetId: string): number {
    return this.entries.get(assetId)?.references ?? 0;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const entry of this.entries.values()) {
      void entry.texture.then((texture) => texture.destroy(true)).catch(() => undefined);
    }
    this.entries.clear();
  }
}

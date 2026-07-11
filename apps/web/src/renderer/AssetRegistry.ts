import { Assets, type Texture } from 'pixi.js';

import { STAMP_ASSETS, type StampAssetDefinition } from '../assets/stamp-assets.js';

interface AssetEntry {
  readonly definition: StampAssetDefinition;
  readonly texture: Promise<Texture>;
  references: number;
}

export interface TextureLease {
  readonly texture: Promise<Texture>;
  release(): void;
}

/** Owns one shared texture promise per built-in asset for the renderer lifetime. */
export class AssetRegistry {
  private readonly entries = new Map<string, AssetEntry>();
  private destroyed = false;

  constructor(
    private readonly loadTexture: (url: string) => Promise<Texture> = (url) =>
      Assets.load<Texture>(url),
  ) {}

  acquire(assetId: string): TextureLease {
    if (this.destroyed) throw new Error('AssetRegistry has been destroyed.');
    const definition = STAMP_ASSETS.find((asset) => asset.id === assetId);
    if (!definition) throw new Error(`Unknown stamp asset ${assetId}.`);
    let entry = this.entries.get(assetId);
    if (!entry) {
      entry = { definition, texture: this.loadTexture(definition.url), references: 0 };
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

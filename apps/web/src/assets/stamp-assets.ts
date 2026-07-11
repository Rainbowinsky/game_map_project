import mountainUrl from './stamps/mountain.svg?url';
import townUrl from './stamps/town.svg?url';
import treeUrl from './stamps/tree.svg?url';
import { MAX_OBJECT_SCALE, MIN_OBJECT_SCALE, type StampKind } from '@fantasy-map/map-model';

export const STAMP_INTRINSIC_SIZE = 96;
/** New stamps remain comfortably visible without becoming huge at high zoom. */
export const STAMP_PLACEMENT_SCREEN_SIZE = 64;

export function stampPlacementScale(cameraZoom: number): number {
  if (!Number.isFinite(cameraZoom) || cameraZoom <= 0) {
    throw new RangeError('Camera zoom must be a positive finite number.');
  }
  const scale = STAMP_PLACEMENT_SCREEN_SIZE / (STAMP_INTRINSIC_SIZE * cameraZoom);
  return Math.min(MAX_OBJECT_SCALE, Math.max(MIN_OBJECT_SCALE, scale));
}

export interface StampAssetDefinition {
  readonly id: string;
  readonly kind: StampKind;
  readonly name: string;
  readonly description: string;
  readonly url: string;
}

export const STAMP_ASSETS: readonly StampAssetDefinition[] = [
  {
    id: '20000000-0000-4000-8000-000000000001',
    kind: 'mountain',
    name: '远峰',
    description: '原创双峰山脉图章',
    url: mountainUrl,
  },
  {
    id: '20000000-0000-4000-8000-000000000002',
    kind: 'tree',
    name: '古杉',
    description: '原创常青树图章',
    url: treeUrl,
  },
  {
    id: '20000000-0000-4000-8000-000000000003',
    kind: 'town',
    name: '边镇',
    description: '原创聚落图章',
    url: townUrl,
  },
] as const;

export const DEFAULT_STAMP_ASSET_ID = STAMP_ASSETS[0]!.id;

export function getStampAsset(assetId: string): StampAssetDefinition | undefined {
  return STAMP_ASSETS.find((asset) => asset.id === assetId);
}

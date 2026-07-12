import type { TerrainKind } from '@fantasy-map/map-model';

export interface TerrainBrushPreset {
  readonly id: string;
  readonly name: string;
  readonly terrainKind: TerrainKind;
  readonly previewColor: string;
  readonly color?: string;
}

export const BUILTIN_TERRAIN_BRUSHES: readonly TerrainBrushPreset[] = [
  { id: 'builtin:water', name: '水域', terrainKind: 'water', previewColor: '#6F9DB2' },
  { id: 'builtin:forest', name: '森林', terrainKind: 'forest', previewColor: '#657A58' },
  { id: 'builtin:mountain', name: '山地', terrainKind: 'mountain', previewColor: '#8B8173' },
  { id: 'builtin:desert', name: '沙漠', terrainKind: 'desert', previewColor: '#C9AC6C' },
  { id: 'builtin:grassland', name: '草地', terrainKind: 'grassland', previewColor: '#9DAE72' },
];

export const DEFAULT_TERRAIN_BRUSH = BUILTIN_TERRAIN_BRUSHES[1]!;

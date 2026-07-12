import { create } from 'zustand';

import type { TerrainBrush, TerrainKind } from '@fantasy-map/map-model';
import { DEFAULT_STAMP_ASSET_ID } from '../assets/stamp-assets.js';
import { DEFAULT_TERRAIN_BRUSH, type TerrainBrushPreset } from '../assets/terrain-brush-presets.js';

export type EditorTool =
  | 'select'
  | 'pan'
  | 'stamp'
  | 'terrain-brush'
  | 'terrain-eraser'
  | 'road'
  | 'river'
  | 'region'
  | 'text'
  | 'location';
export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'offline' | 'error' | 'conflict';

interface EditorState {
  tool: EditorTool;
  selection: string[];
  activeLayerId: string | null;
  activeStampAssetId: string;
  terrainKind: TerrainKind;
  terrainBrush: TerrainBrush;
  activeBrushPresetId: string;
  geometryStyle: {
    roadWidth: number;
    riverWidth: number;
    regionStrokeWidth: number;
    opacity: number;
  };
  textDraft: { text: string; fontSize: number; align: 'left' | 'center' | 'right' };
  locationDraft: { name: string; type: string; summary: string; description: string; tags: string };
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  saveStatus: SaveStatus;
  setTool: (tool: EditorTool) => void;
  setSelection: (selection: string[]) => void;
  setActiveLayer: (layerId: string | null) => void;
  setActiveStampAsset: (assetId: string) => void;
  setTerrainBrush: (changes: Partial<TerrainBrush>) => void;
  applyBrushPreset: (preset: TerrainBrushPreset) => void;
  setGeometryStyle: (changes: Partial<EditorState['geometryStyle']>) => void;
  setTextDraft: (changes: Partial<EditorState['textDraft']>) => void;
  setLocationDraft: (changes: Partial<EditorState['locationDraft']>) => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  setSaveStatus: (saveStatus: SaveStatus) => void;
  reset: () => void;
}

const initialState = {
  tool: 'select' as const,
  selection: [] as string[],
  activeLayerId: null as string | null,
  activeStampAssetId: DEFAULT_STAMP_ASSET_ID,
  terrainKind: 'forest' as const,
  terrainBrush: { radius: 24, opacity: 0.7, spacing: 1, hardness: 0.72 },
  activeBrushPresetId: DEFAULT_TERRAIN_BRUSH.id,
  geometryStyle: { roadWidth: 8, riverWidth: 18, regionStrokeWidth: 3, opacity: 0.72 },
  textDraft: { text: '新文字', fontSize: 32, align: 'center' as const },
  locationDraft: { name: '新地点', type: 'place', summary: '', description: '', tags: '' },
  leftPanelOpen: true,
  rightPanelOpen: true,
  saveStatus: 'saved' as const,
};

export const useEditorStore = create<EditorState>((set) => ({
  ...initialState,
  setTool: (tool) => set({ tool }),
  setSelection: (selection) => set({ selection }),
  setActiveLayer: (activeLayerId) => set({ activeLayerId, selection: [] }),
  setActiveStampAsset: (activeStampAssetId) => set({ activeStampAssetId, tool: 'stamp' }),
  setTerrainBrush: (changes) =>
    set((state) => ({
      terrainBrush: { ...state.terrainBrush, ...changes },
    })),
  applyBrushPreset: (preset) =>
    set((state) => ({
      tool: 'terrain-brush',
      terrainKind: preset.terrainKind,
      activeBrushPresetId: preset.id,
      terrainBrush: {
        radius: state.terrainBrush.radius,
        opacity: state.terrainBrush.opacity,
        spacing: state.terrainBrush.spacing,
        hardness: state.terrainBrush.hardness,
        ...(preset.color ? { color: preset.color, name: preset.name } : {}),
      },
    })),
  setGeometryStyle: (changes) =>
    set((state) => ({ geometryStyle: { ...state.geometryStyle, ...changes } })),
  setTextDraft: (changes) => set((state) => ({ textDraft: { ...state.textDraft, ...changes } })),
  setLocationDraft: (changes) =>
    set((state) => ({ locationDraft: { ...state.locationDraft, ...changes } })),
  toggleLeftPanel: () => set((state) => ({ leftPanelOpen: !state.leftPanelOpen })),
  toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  reset: () => set(initialState),
}));

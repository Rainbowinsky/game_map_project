import { create } from 'zustand';

import type { TerrainBrush, TerrainKind } from '@fantasy-map/map-model';
import { DEFAULT_STAMP_ASSET_ID } from '../assets/stamp-assets.js';

export type EditorTool =
  'select' | 'pan' | 'stamp' | 'terrain-brush' | 'terrain-eraser' | 'road' | 'river' | 'region';
export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'offline' | 'error' | 'conflict';

interface EditorState {
  tool: EditorTool;
  selection: string[];
  activeLayerId: string | null;
  activeStampAssetId: string;
  terrainKind: TerrainKind;
  terrainBrush: TerrainBrush;
  geometryStyle: {
    roadWidth: number;
    riverWidth: number;
    regionStrokeWidth: number;
    opacity: number;
  };
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  saveStatus: SaveStatus;
  setTool: (tool: EditorTool) => void;
  setSelection: (selection: string[]) => void;
  setActiveLayer: (layerId: string | null) => void;
  setActiveStampAsset: (assetId: string) => void;
  setTerrainKind: (kind: TerrainKind) => void;
  setTerrainBrush: (changes: Partial<TerrainBrush>) => void;
  setGeometryStyle: (changes: Partial<EditorState['geometryStyle']>) => void;
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
  geometryStyle: { roadWidth: 8, riverWidth: 18, regionStrokeWidth: 3, opacity: 0.72 },
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
  setTerrainKind: (terrainKind) => set({ terrainKind }),
  setTerrainBrush: (changes) =>
    set((state) => ({ terrainBrush: { ...state.terrainBrush, ...changes } })),
  setGeometryStyle: (changes) =>
    set((state) => ({ geometryStyle: { ...state.geometryStyle, ...changes } })),
  toggleLeftPanel: () => set((state) => ({ leftPanelOpen: !state.leftPanelOpen })),
  toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  reset: () => set(initialState),
}));

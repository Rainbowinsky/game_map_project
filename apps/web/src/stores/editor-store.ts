import { create } from 'zustand';

import { DEFAULT_STAMP_ASSET_ID } from '../assets/stamp-assets.js';

export type EditorTool = 'select' | 'pan' | 'stamp';
export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'offline' | 'error' | 'conflict';

interface EditorState {
  tool: EditorTool;
  selection: string[];
  activeLayerId: string | null;
  activeStampAssetId: string;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  saveStatus: SaveStatus;
  setTool: (tool: EditorTool) => void;
  setSelection: (selection: string[]) => void;
  setActiveLayer: (layerId: string | null) => void;
  setActiveStampAsset: (assetId: string) => void;
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
  toggleLeftPanel: () => set((state) => ({ leftPanelOpen: !state.leftPanelOpen })),
  toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  reset: () => set(initialState),
}));

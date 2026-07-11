import type { DragEvent } from 'react';

import { STAMP_ASSETS } from '../assets/stamp-assets.js';
import { useEditorStore } from '../stores/editor-store.js';
import { Icon } from './Icon.js';

interface StampAssetPanelProps {
  readonly onClose: () => void;
}

export function StampAssetPanel({ onClose }: StampAssetPanelProps) {
  const activeAssetId = useEditorStore((state) => state.activeStampAssetId);
  const setActiveStampAsset = useEditorStore((state) => state.setActiveStampAsset);
  const startDrag = (event: DragEvent<HTMLButtonElement>, assetId: string) => {
    event.dataTransfer.setData('application/x-map-stamp', assetId);
    event.dataTransfer.effectAllowed = 'copy';
    setActiveStampAsset(assetId);
  };

  return (
    <>
      <div className="panel-heading">
        <div>
          <p className="kicker">ASSET LIBRARY</p>
          <h2>图章素材</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="收起素材面板">
          <Icon name="back" />
        </button>
      </div>
      <label className="panel-search">
        <Icon name="search" />
        <input value="内置原创素材" readOnly aria-label="素材来源" />
      </label>
      <div className="asset-category">
        {STAMP_ASSETS.map((asset) => (
          <button
            className={activeAssetId === asset.id ? 'active' : ''}
            key={asset.id}
            draggable
            onClick={() => setActiveStampAsset(asset.id)}
            onDragStart={(event) => startDrag(event, asset.id)}
            title="点击后在画布放置，或直接拖到画布"
          >
            <span className="asset-swatch">
              <img src={asset.url} alt="" />
            </span>
            <span>{asset.name}</span>
            <small>{asset.description}</small>
          </button>
        ))}
      </div>
      <div className="panel-note">
        <Icon name="command" />
        <p>点击素材后在画布放置；也可将素材拖到精确位置。三枚 SVG 均为本项目原创。</p>
      </div>
    </>
  );
}

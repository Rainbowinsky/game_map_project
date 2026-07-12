import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  BUILTIN_TERRAIN_BRUSHES,
  DEFAULT_TERRAIN_BRUSH,
  type TerrainBrushPreset,
} from '../assets/terrain-brush-presets.js';
import { api } from '../services/api-client.js';
import { useEditorStore } from '../stores/editor-store.js';
import { useSessionStore } from '../stores/session-store.js';
import { Icon } from './Icon.js';

interface Props {
  readonly onManage: () => void;
}

export function TerrainBrushPicker({ onManage }: Props) {
  const session = useSessionStore((state) => state.session)!;
  const activeBrushPresetId = useEditorStore((state) => state.activeBrushPresetId);
  const applyBrushPreset = useEditorStore((state) => state.applyBrushPreset);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const brushes = useQuery({
    queryKey: ['user-brushes', session.user.id],
    queryFn: () => api.listUserBrushes(session.accessToken),
  });
  const customBrushes = useMemo<readonly TerrainBrushPreset[]>(
    () =>
      brushes.data?.items.map((brush) => ({
        id: brush.id,
        name: brush.name,
        color: brush.color,
        previewColor: brush.color,
        terrainKind: 'grassland',
      })) ?? [],
    [brushes.data],
  );
  const allBrushes = useMemo(() => [...BUILTIN_TERRAIN_BRUSHES, ...customBrushes], [customBrushes]);
  const activeBrush =
    allBrushes.find((brush) => brush.id === activeBrushPresetId) ?? DEFAULT_TERRAIN_BRUSH;

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const select = (brush: TerrainBrushPreset) => {
    applyBrushPreset(brush);
    setOpen(false);
  };

  return (
    <div className="terrain-brush-picker" ref={rootRef}>
      <button
        className="active-brush-row"
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <i style={{ background: activeBrush.previewColor }} />
        <span>
          <small>当前笔刷</small>
          <strong>{activeBrush.name}</strong>
        </span>
        <b>{activeBrush.color ?? '内置'}</b>
        <Icon name="chevron" />
      </button>
      {open && (
        <section
          className="terrain-brush-popover popover-enter"
          role="dialog"
          aria-label="选择笔刷"
        >
          <header>
            <div>
              <strong>选择笔刷</strong>
              <small>{allBrushes.length} 种可用</small>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onManage();
              }}
            >
              新增笔刷
            </button>
          </header>
          <div className="terrain-brush-popover__scroll">
            <p>内置分类</p>
            <div className="terrain-brush-card-grid">
              {BUILTIN_TERRAIN_BRUSHES.map((brush) => (
                <BrushCard
                  key={brush.id}
                  brush={brush}
                  active={activeBrush.id === brush.id}
                  onSelect={select}
                />
              ))}
            </div>
            {customBrushes.length > 0 && (
              <>
                <p>我的笔刷</p>
                <div className="terrain-brush-card-grid">
                  {customBrushes.map((brush) => (
                    <BrushCard
                      key={brush.id}
                      brush={brush}
                      active={activeBrush.id === brush.id}
                      onSelect={select}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function BrushCard({
  brush,
  active,
  onSelect,
}: {
  readonly brush: TerrainBrushPreset;
  readonly active: boolean;
  readonly onSelect: (brush: TerrainBrushPreset) => void;
}) {
  return (
    <button
      className={active ? 'active' : ''}
      type="button"
      onClick={() => onSelect(brush)}
      aria-pressed={active}
    >
      <i style={{ background: brush.previewColor }} />
      <span>
        <strong>{brush.name}</strong>
        <small>{brush.color ?? '跟随地图主题'}</small>
      </span>
      {active && <em>✓</em>}
    </button>
  );
}

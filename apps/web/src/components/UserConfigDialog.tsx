import { useState, type CSSProperties } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { api, readableError, type UserBrush } from '../services/api-client.js';
import {
  BUILTIN_TERRAIN_BRUSHES,
  DEFAULT_TERRAIN_BRUSH,
  type TerrainBrushPreset,
} from '../assets/terrain-brush-presets.js';
import { useEditorStore } from '../stores/editor-store.js';
import { useSessionStore } from '../stores/session-store.js';
import { AssetLibraryPanel } from './AssetLibraryPanel.js';
import { Icon } from './Icon.js';

interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
}

export function UserConfigDialog({ open, onClose }: Props) {
  const session = useSessionStore((state) => state.session)!;
  const applyBrushPreset = useEditorStore((state) => state.applyBrushPreset);
  const activeBrushPresetId = useEditorStore((state) => state.activeBrushPresetId);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'brushes' | 'assets'>('brushes');
  const [name, setName] = useState('');
  const [color, setColor] = useState('#69745B');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const brushes = useQuery({
    queryKey: ['user-brushes', session.user.id],
    queryFn: () => api.listUserBrushes(session.accessToken),
    enabled: open,
  });

  if (!open) return null;

  const createBrush = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      const brush = await api.createUserBrush(session.accessToken, { name: name.trim(), color });
      applyBrushPreset(toCustomPreset(brush));
      setName('');
      await queryClient.invalidateQueries({ queryKey: ['user-brushes', session.user.id] });
    } catch (createError) {
      setError(readableError(createError));
    } finally {
      setBusy(false);
    }
  };

  const removeBrush = async (brush: UserBrush) => {
    if (!window.confirm(`删除笔刷“${brush.name}”？已经绘制的内容不会受影响。`)) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.deleteUserBrush(session.accessToken, brush.id);
      if (activeBrushPresetId === brush.id) applyBrushPreset(DEFAULT_TERRAIN_BRUSH);
      await queryClient.invalidateQueries({ queryKey: ['user-brushes', session.user.id] });
    } catch (removeError) {
      setError(readableError(removeError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="user-config-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="user-config-dialog dialog-enter"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-config-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="user-config-header">
          <div className="user-config-identity">
            <span>{session.user.displayName.slice(0, 1)}</span>
            <div>
              <p className="kicker">USER SPACE</p>
              <h2 id="user-config-title">用户配置</h2>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭用户配置">
            <Icon name="close" />
          </button>
        </header>
        <nav className="user-config-tabs" aria-label="用户配置分类">
          <button className={tab === 'brushes' ? 'active' : ''} onClick={() => setTab('brushes')}>
            笔刷 <span>{BUILTIN_TERRAIN_BRUSHES.length + (brushes.data?.items.length ?? 0)}</span>
          </button>
          <button className={tab === 'assets' ? 'active' : ''} onClick={() => setTab('assets')}>
            素材库
          </button>
        </nav>
        <div className="user-config-content">
          {tab === 'assets' ? (
            <AssetLibraryPanel onClose={onClose} />
          ) : (
            <div className="brush-config-layout">
              <section className="brush-collection">
                <div className="brush-section-title">
                  <div>
                    <p className="kicker">MY BRUSHES</p>
                    <h3>我的笔刷</h3>
                  </div>
                  <small>点击即可用于绘制</small>
                </div>
                <p className="brush-group-label">内置分类</p>
                <div className="brush-grid">
                  {BUILTIN_TERRAIN_BRUSHES.map((brush) => (
                    <button
                      key={brush.id}
                      className={
                        activeBrushPresetId === brush.id ? 'brush-card active' : 'brush-card'
                      }
                      onClick={() => applyBrushPreset(brush)}
                    >
                      <i style={{ background: brush.previewColor }} />
                      <span>
                        <strong>{brush.name}</strong>
                        <small>跟随地图主题</small>
                      </span>
                    </button>
                  ))}
                </div>
                <p className="brush-group-label">我的分类</p>
                <div className="brush-grid">
                  {brushes.data?.items.map((brush) => (
                    <article
                      className={
                        activeBrushPresetId === brush.id ? 'brush-card active' : 'brush-card'
                      }
                      key={brush.id}
                    >
                      <button
                        className="brush-card-main"
                        onClick={() => applyBrushPreset(toCustomPreset(brush))}
                      >
                        <i style={{ background: brush.color }} />
                        <span>
                          <strong>{brush.name}</strong>
                          <small>{brush.color}</small>
                        </span>
                      </button>
                      <button
                        className="brush-card-remove"
                        onClick={() => void removeBrush(brush)}
                        disabled={busy}
                        aria-label={`删除笔刷 ${brush.name}`}
                      >
                        <Icon name="close" />
                      </button>
                    </article>
                  ))}
                </div>
                {brushes.isLoading && <div className="brush-loading">正在读取你的笔刷…</div>}
                {brushes.isError && (
                  <p className="asset-error" role="alert">
                    {readableError(brushes.error)}
                  </p>
                )}
                {!brushes.isLoading && brushes.data?.items.length === 0 && (
                  <p className="brush-empty">
                    从右侧创建新的地形分类，它会直接出现在笔刷选择卡片中。
                  </p>
                )}
              </section>
              <aside className="brush-creator">
                <p className="kicker">NEW PRESET</p>
                <h3>新增地形笔刷</h3>
                <p>名称就是新的地形分类。保存后可与森林、水域等内置笔刷并列使用。</p>
                <div
                  className="brush-color-preview"
                  style={{ '--brush-color': color } as CSSProperties}
                >
                  <i />
                  <span>{color.toUpperCase()}</span>
                </div>
                <label>
                  <span>笔刷名称</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={60}
                    placeholder="例如：暮色海岸"
                  />
                </label>
                <label>
                  <span>笔刷颜色</span>
                  <div className="brush-color-field">
                    <input
                      type="color"
                      value={color}
                      onChange={(event) => setColor(event.target.value.toUpperCase())}
                    />
                    <input
                      value={color}
                      onChange={(event) =>
                        /^#[0-9a-fA-F]{0,6}$/.test(event.target.value) &&
                        setColor(event.target.value)
                      }
                      maxLength={7}
                      aria-label="十六进制笔刷颜色"
                    />
                  </div>
                </label>
                {error && (
                  <p className="asset-error" role="alert">
                    {error}
                  </p>
                )}
                <button
                  className="button button--primary button--wide"
                  onClick={() => void createBrush()}
                  disabled={busy || !name.trim() || !/^#[0-9a-fA-F]{6}$/.test(color)}
                >
                  {busy ? '正在保存…' : '保存并使用'}
                </button>
              </aside>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function toCustomPreset(brush: UserBrush): TerrainBrushPreset {
  return {
    id: brush.id,
    name: brush.name,
    color: brush.color,
    previewColor: brush.color,
    terrainKind: 'grassland',
  };
}

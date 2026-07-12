import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useEditorStore } from '../stores/editor-store.js';
import { useMapStore } from '../stores/map-store.js';
import type { CommandManager } from '../editor/commands/CommandManager.js';
import {
  DeleteLocationCommand,
  UpdateLocationCommand,
  UpdateLocationIconCommand,
} from '../editor/commands/commands.js';
import { api } from '../services/api-client.js';
import { useSessionStore } from '../stores/session-store.js';
import { AuthenticatedAssetImage } from './AuthenticatedAssetImage.js';

export function LocationPanel({
  onLocate,
  commandManager,
}: {
  onLocate: (point: { x: number; y: number }) => void;
  commandManager: CommandManager;
}) {
  const locations = useMapStore((state) => Object.values(state.locationsById));
  const session = useSessionStore((state) => state.session)!;
  const assets = useQuery({
    queryKey: ['assets', session.user.id, 'marker-picker'],
    queryFn: () => api.listAssets(session.accessToken),
  });
  const objects = useMapStore((state) => state.objectsById);
  const selection = useEditorStore((state) => state.selection);
  const setSelection = useEditorStore((state) => state.setSelection);
  const [query, setQuery] = useState('');
  const selectedMarker = selection
    .map((id) => objects[id])
    .find((object) => object?.type === 'marker');
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const selectedId = selectedMarker?.type === 'marker' ? selectedMarker.locationId : openedId;
  const selected = selectedId
    ? locations.find((location) => location.id === selectedId)
    : undefined;
  const normalized = query.trim().toLocaleLowerCase();
  const filtered = useMemo(
    () =>
      locations.filter(
        (location) =>
          !normalized ||
          location.name.toLocaleLowerCase().includes(normalized) ||
          location.type.toLocaleLowerCase().includes(normalized) ||
          location.tags.some((tag) => tag.toLocaleLowerCase().includes(normalized)),
      ),
    [locations, normalized],
  );

  const open = (location: (typeof locations)[number]) => {
    setOpenedId(location.id);
    if (location.markerObjectId) setSelection([location.markerObjectId]);
  };
  const beginEdit = () => {
    if (!selected) return;
    setEditName(selected.name);
    setEditSummary(selected.summary ?? '');
    setEditing(true);
  };
  const saveEdit = () => {
    if (!selected) return;
    commandManager.execute(
      new UpdateLocationCommand(selected.id, {
        name: editName,
        summary: editSummary.trim() || null,
      }),
    );
    setEditing(false);
  };
  const remove = () => {
    if (!selected || !window.confirm(`删除地点“${selected.name}”及其标记？`)) return;
    commandManager.execute(new DeleteLocationCommand(selected.id));
    setOpenedId(null);
    setSelection([]);
  };

  return (
    <section className="location-panel" aria-label="地点资料">
      <label className="location-search">
        <span>搜索地点</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="名称、类型或标签"
        />
      </label>
      {selected && (
        <article className="location-detail">
          <small>{selected.type}</small>
          {editing ? (
            <>
              <label>
                <span>名称</span>
                <input value={editName} onChange={(event) => setEditName(event.target.value)} />
              </label>
              <label>
                <span>摘要</span>
                <textarea
                  value={editSummary}
                  onChange={(event) => setEditSummary(event.target.value)}
                />
              </label>
            </>
          ) : (
            <>
              <h3>{selected.name}</h3>
              {selected.summary && <p>{selected.summary}</p>}
            </>
          )}
          {selected.description && <p className="location-description">{selected.description}</p>}
          {selected.tags.length > 0 && (
            <div className="location-tags">
              {selected.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          )}
          <div className="marker-icon-picker" aria-label="地点标记图标">
            <strong>标记图标</strong>
            <button
              className={selected.iconAssetId === null ? 'active' : ''}
              onClick={() =>
                commandManager.execute(new UpdateLocationIconCommand(selected.id, null))
              }
            >
              默认
            </button>
            {assets.data?.items.map((asset) => (
              <button
                key={asset.id}
                className={selected.iconAssetId === asset.id ? 'active' : ''}
                title={asset.displayName}
                onClick={() =>
                  commandManager.execute(new UpdateLocationIconCommand(selected.id, asset.id))
                }
              >
                <AuthenticatedAssetImage
                  accessToken={session.accessToken}
                  assetId={asset.id}
                  alt={asset.displayName}
                />
              </button>
            ))}
          </div>
          <button className="button" onClick={() => onLocate(selected)}>
            定位到画布
          </button>
          {editing ? (
            <>
              <button className="button" onClick={saveEdit}>
                保存资料
              </button>
              <button className="button" onClick={() => setEditing(false)}>
                取消
              </button>
            </>
          ) : (
            <button className="button" onClick={beginEdit}>
              编辑
            </button>
          )}
          <button className="button" onClick={remove}>
            删除
          </button>
        </article>
      )}
      <div className="location-list">
        {filtered.map((location) => (
          <button
            key={location.id}
            className={location.id === selected?.id ? 'active' : ''}
            onClick={() => open(location)}
          >
            <strong>{location.name}</strong>
            <small>
              {location.type}
              {location.tags.length ? ` · ${location.tags.join(' / ')}` : ''}
            </small>
          </button>
        ))}
        {filtered.length === 0 && <p>没有匹配的地点。</p>}
      </div>
    </section>
  );
}

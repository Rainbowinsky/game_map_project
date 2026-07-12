import { useEffect, useMemo, useState, type DragEvent, type KeyboardEvent } from 'react';
import type { MapLayer, MapLayerType } from '@fantasy-map/map-model';

import type { CommandManager } from '../editor/commands/CommandManager.js';
import {
  CreateLayerCommand,
  CreateObjectCommand,
  DeleteLayerCommand,
  ReorderLayersCommand,
  UpdateLayerCommand,
} from '../editor/commands/commands.js';
import { flattenLayerTree, siblingIds } from '../editor/layers/layer-tree.js';
import { useEditorStore } from '../stores/editor-store.js';
import { useMapStore } from '../stores/map-store.js';
import { Icon } from './Icon.js';

interface LayerPanelProps {
  readonly commandManager: CommandManager;
}

function freshLayer(documentId: string, order: number, type: MapLayerType): MapLayer {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    mapId: documentId,
    parentId: null,
    name:
      type === 'vector-path'
        ? '路径'
        : type === 'region'
          ? '区域'
          : type === 'raster'
            ? '地形'
            : type === 'text'
              ? '文字'
              : type === 'marker'
                ? '地点标记'
                : type === 'group'
                  ? '图层组'
                  : '图章',
    type,
    order,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    createdAt: now,
    updatedAt: now,
  };
}

export function LayerPanel({ commandManager }: LayerPanelProps) {
  const document = useMapStore((state) => state.document);
  const layersById = useMapStore((state) => state.layersById);
  const objectsById = useMapStore((state) => state.objectsById);
  const activeLayerId = useEditorStore((state) => state.activeLayerId);
  const setActiveLayer = useEditorStore((state) => state.setActiveLayer);
  const selection = useEditorStore((state) => state.selection);
  const setSelection = useEditorStore((state) => state.setSelection);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deletePolicy, setDeletePolicy] = useState<'delete' | 'move'>('delete');
  const [targetLayerId, setTargetLayerId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const layers = useMemo(() => Object.values(layersById), [layersById]);
  const items = useMemo(() => flattenLayerTree(layers), [layers]);
  const activeLayer = activeLayerId ? layersById[activeLayerId] : undefined;
  const deleteLayer = deleteId ? layersById[deleteId] : undefined;
  const deleteObjects = deleteLayer
    ? Object.values(objectsById).filter((object) => object.layerId === deleteLayer.id)
    : [];
  const moveTargets = layers.filter(
    (layer) => layer.id !== deleteId && layer.type === deleteLayer?.type && !layer.locked,
  );

  useEffect(() => {
    if (layers.length === 0) return setActiveLayer(null);
    if (!activeLayerId || !layersById[activeLayerId]) {
      const preferred = [...layers]
        .sort((a, b) => b.order - a.order)
        .find((layer) => layer.type === 'stamp');
      setActiveLayer(preferred?.id ?? layers[0]?.id ?? null);
    }
  }, [activeLayerId, layers, layersById, setActiveLayer]);

  const run = (action: () => void) => {
    try {
      action();
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '图层操作失败。');
    }
  };

  const createLayer = (
    type: 'stamp' | 'vector-path' | 'region' | 'raster' | 'text' | 'marker' | 'group',
  ) => {
    if (!document) return;
    const rootCount = layers.filter((layer) => layer.parentId === null).length;
    const layer = freshLayer(document.id, rootCount, type);
    run(() => commandManager.execute(new CreateLayerCommand(layer)));
    setActiveLayer(layer.id);
    setRenamingId(layer.id);
    setRenameValue(layer.name);
    setCreateMenuOpen(false);
  };

  const commitRename = (layer: MapLayer) => {
    const name = renameValue.trim();
    setRenamingId(null);
    if (!name || name === layer.name) return;
    run(() => commandManager.execute(new UpdateLayerCommand(layer.id, { name })));
  };

  const move = (layer: MapLayer, delta: -1 | 1) => {
    const ordered = siblingIds(layers, layer.parentId);
    const from = ordered.indexOf(layer.id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ordered.length) return;
    [ordered[from], ordered[to]] = [ordered[to]!, ordered[from]!];
    run(() => commandManager.execute(new ReorderLayersCommand(layer.parentId, ordered)));
  };

  const drop = (event: DragEvent, target: MapLayer) => {
    event.preventDefault();
    const source = draggedId ? layersById[draggedId] : undefined;
    setDraggedId(null);
    if (!source || source.id === target.id || source.parentId !== target.parentId) return;
    const ordered = siblingIds(layers, source.parentId);
    const from = ordered.indexOf(source.id);
    const to = ordered.indexOf(target.id);
    ordered.splice(from, 1);
    ordered.splice(to, 0, source.id);
    run(() => commandManager.execute(new ReorderLayersCommand(source.parentId, ordered)));
  };

  const duplicate = () => {
    if (!document || !activeLayer || activeLayer.type === 'group') return;
    const now = new Date().toISOString();
    const rootCount = layers.filter((layer) => layer.parentId === activeLayer.parentId).length;
    const copy = {
      ...activeLayer,
      id: crypto.randomUUID(),
      name: `${activeLayer.name} 副本`,
      order: rootCount,
      locked: false,
      createdAt: now,
      updatedAt: now,
    };
    run(() => {
      const transaction = commandManager.beginTransaction('Duplicate layer');
      transaction.add(new CreateLayerCommand(copy));
      for (const object of Object.values(objectsById).filter(
        (candidate) => candidate.layerId === activeLayer.id,
      )) {
        transaction.add(
          new CreateObjectCommand({
            ...object,
            id: crypto.randomUUID(),
            layerId: copy.id,
            locked: false,
            createdAt: now,
            updatedAt: now,
          }),
        );
      }
      transaction.commit();
    });
    setActiveLayer(copy.id);
  };

  const openDelete = () => {
    if (!activeLayer || activeLayer.type === 'background') return;
    if (layers.some((layer) => layer.parentId === activeLayer.id)) {
      setMessage('包含子图层的组暂不能删除；请先处理组内图层。');
      return;
    }
    const preferredTarget = moveTargets.find((layer) => layer.id !== activeLayer.id)?.id ?? '';
    setDeletePolicy(deleteObjects.length > 0 && preferredTarget ? 'move' : 'delete');
    setTargetLayerId(preferredTarget);
    setDeleteId(activeLayer.id);
  };

  const confirmDelete = () => {
    if (!deleteLayer) return;
    run(() =>
      commandManager.execute(
        new DeleteLayerCommand(
          deleteLayer.id,
          deleteObjects.length === 0 ? 'delete' : deletePolicy,
          deletePolicy === 'move' ? targetLayerId : undefined,
        ),
      ),
    );
    setDeleteId(null);
    setActiveLayer(null);
  };

  const renameKey = (event: KeyboardEvent<HTMLInputElement>, layer: MapLayer) => {
    if (event.key === 'Enter') event.currentTarget.blur();
    if (event.key === 'Escape') {
      setRenamingId(null);
      setRenameValue(layer.name);
    }
  };

  const clearLayerSelection = (layerId: string) => {
    setSelection(selection.filter((objectId) => objectsById[objectId]?.layerId !== layerId));
  };

  return (
    <>
      <div className="layer-actions">
        <span>{layers.length} 个图层</span>
        <div className="layer-create-menu">
          <button
            className="layer-create-trigger"
            aria-expanded={createMenuOpen}
            aria-haspopup="menu"
            onClick={() => setCreateMenuOpen((open) => !open)}
          >
            <Icon name="plus" /> 新增图层
          </button>
          {createMenuOpen && (
            <div className="layer-create-options" role="menu" aria-label="选择图层分类">
              <button role="menuitem" onClick={() => createLayer('stamp')}>
                <Icon name="stamp" /><span><strong>图章</strong><small>放置山脉、树木和城镇图章</small></span>
              </button>
              <button role="menuitem" onClick={() => createLayer('vector-path')}>
                <Icon name="path" /><span><strong>路径</strong><small>绘制道路和河流</small></span>
              </button>
              <button role="menuitem" onClick={() => createLayer('region')}>
                <Icon name="region" /><span><strong>区域</strong><small>绘制封闭区域</small></span>
              </button>
              <button role="menuitem" onClick={() => createLayer('raster')}>
                <Icon name="brush" /><span><strong>地形</strong><small>使用地形笔刷绘制</small></span>
              </button>
              <button role="menuitem" onClick={() => createLayer('text')}>
                <Icon name="text" /><span><strong>文字</strong><small>添加地图名称和注释</small></span>
              </button>
              <button role="menuitem" onClick={() => createLayer('marker')}>
                <Icon name="map" /><span><strong>地点标记</strong><small>添加地点资料及标记</small></span>
              </button>
              <button role="menuitem" onClick={() => createLayer('group')}>
                <Icon name="layers" /><span><strong>图层组</strong><small>整理相关图层</small></span>
              </button>
            </div>
          )}
        </div>
      </div>
      <p className="layer-group-note">组层级按缩进显示；P8 暂不提供跨组拖放。</p>
      {message && (
        <p className="layer-message" role="alert">
          {message}
        </p>
      )}
      <div className="layer-list" role="listbox" aria-label="地图图层">
        {items.map(({ layer, depth }) => (
          <div
            className={`layer-row ${activeLayerId === layer.id ? 'active' : ''} ${!layer.visible ? 'is-hidden' : ''}`}
            key={layer.id}
            role="option"
            aria-selected={activeLayerId === layer.id}
            draggable={layer.type !== 'background' && !layer.locked}
            onDragStart={() => setDraggedId(layer.id)}
            onDragEnd={() => setDraggedId(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => drop(event, layer)}
            onClick={() => setActiveLayer(layer.id)}
            style={{ paddingLeft: `${0.45 + depth * 0.7}rem` }}
          >
            <span className="layer-row__drag" aria-hidden="true">
              ⠿
            </span>
            <span className="layer-row__thumb">
              <Icon name={layer.type === 'group' ? 'layers' : 'stamp'} />
            </span>
            <span className="layer-row__name">
              {renamingId === layer.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  maxLength={120}
                  aria-label="图层名称"
                  onChange={(event) => setRenameValue(event.target.value)}
                  onBlur={() => commitRename(layer)}
                  onKeyDown={(event) => renameKey(event, layer)}
                  onClick={(event) => event.stopPropagation()}
                />
              ) : (
                <strong
                  onDoubleClick={() => {
                    setRenamingId(layer.id);
                    setRenameValue(layer.name);
                  }}
                >
                  {layer.name}
                </strong>
              )}
              <small>{layer.type.toUpperCase()}</small>
            </span>
            <button
              className="layer-row__toggle"
              aria-label={layer.visible ? '隐藏图层' : '显示图层'}
              title={layer.visible ? '隐藏' : '显示'}
              onClick={(event) => {
                event.stopPropagation();
                run(() =>
                  commandManager.execute(
                    new UpdateLayerCommand(layer.id, { visible: !layer.visible }),
                  ),
                );
                if (layer.visible) clearLayerSelection(layer.id);
              }}
            >
              {layer.visible ? '◉' : '○'}
            </button>
            <button
              className="layer-row__toggle"
              aria-label={layer.locked ? '解锁图层' : '锁定图层'}
              title={layer.locked ? '解锁' : '锁定'}
              onClick={(event) => {
                event.stopPropagation();
                run(() =>
                  commandManager.execute(
                    new UpdateLayerCommand(layer.id, { locked: !layer.locked }),
                  ),
                );
                if (!layer.locked) clearLayerSelection(layer.id);
              }}
            >
              {layer.locked ? '◆' : '◇'}
            </button>
          </div>
        ))}
      </div>
      {activeLayer && (
        <div className="layer-detail">
          <div className="layer-detail__buttons">
            <button
              onClick={() => {
                setRenamingId(activeLayer.id);
                setRenameValue(activeLayer.name);
              }}
              disabled={activeLayer.locked}
            >
              重命名
            </button>
            <button onClick={() => move(activeLayer, 1)} disabled={activeLayer.locked}>
              上移
            </button>
            <button onClick={() => move(activeLayer, -1)} disabled={activeLayer.locked}>
              下移
            </button>
          </div>
          <label>
            <span>
              不透明度 <b>{Math.round(activeLayer.opacity * 100)}%</b>
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={activeLayer.opacity}
              disabled={activeLayer.locked}
              onChange={(event) =>
                run(() =>
                  commandManager.execute(
                    new UpdateLayerCommand(
                      activeLayer.id,
                      { opacity: Number(event.target.value) },
                      'layer-opacity',
                    ),
                  ),
                )
              }
            />
          </label>
          <label>
            <span>混合模式</span>
            <select
              value={activeLayer.blendMode}
              disabled={activeLayer.locked}
              onChange={(event) =>
                run(() =>
                  commandManager.execute(
                    new UpdateLayerCommand(activeLayer.id, {
                      blendMode: event.target.value as MapLayer['blendMode'],
                    }),
                  ),
                )
              }
            >
              <option value="normal">正常</option>
              <option value="multiply">正片叠底</option>
              <option value="screen">滤色</option>
              <option value="overlay">叠加</option>
              <option value="darken">变暗</option>
              <option value="lighten">变亮</option>
            </select>
          </label>
          <div className="layer-detail__buttons layer-detail__buttons--danger">
            <button onClick={duplicate} disabled={activeLayer.type === 'group'}>
              复制图层
            </button>
            <button
              onClick={openDelete}
              disabled={activeLayer.type === 'background' || activeLayer.locked}
            >
              删除图层
            </button>
          </div>
        </div>
      )}
      {deleteLayer && (
        <div
          className="layer-dialog-backdrop"
          role="presentation"
          onMouseDown={() => setDeleteId(null)}
        >
          <section
            className="layer-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-layer-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h3 id="delete-layer-title">删除“{deleteLayer.name}”？</h3>
            {deleteObjects.length > 0 ? (
              <>
                <p>该图层包含 {deleteObjects.length} 个对象。请选择明确的处理方式。</p>
                <label>
                  <input
                    type="radio"
                    checked={deletePolicy === 'move'}
                    disabled={moveTargets.length === 0}
                    onChange={() => setDeletePolicy('move')}
                  />{' '}
                  移动对象到
                </label>
                <select
                  value={targetLayerId}
                  disabled={deletePolicy !== 'move'}
                  onChange={(event) => setTargetLayerId(event.target.value)}
                >
                  {moveTargets.map((layer) => (
                    <option key={layer.id} value={layer.id}>
                      {layer.name}
                    </option>
                  ))}
                </select>
                <label>
                  <input
                    type="radio"
                    checked={deletePolicy === 'delete'}
                    onChange={() => setDeletePolicy('delete')}
                  />{' '}
                  同时删除这些对象
                </label>
              </>
            ) : (
              <p>该图层为空。此操作可以撤销。</p>
            )}
            <div>
              <button onClick={() => setDeleteId(null)}>取消</button>
              <button
                className="danger"
                onClick={confirmDelete}
                disabled={deletePolicy === 'move' && !targetLayerId}
              >
                确认删除
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useParams } from 'react-router-dom';
import type { MapObject } from '@fantasy-map/map-model';

import { Brand } from '../components/Brand.js';
import { ErrorState } from '../components/ErrorState.js';
import { ExportDialog } from '../components/ExportDialog.js';
import { Icon } from '../components/Icon.js';
import { LoadingState } from '../components/LoadingState.js';
import { LayerPanel } from '../components/LayerPanel.js';
import { ObjectInspector } from '../components/ObjectInspector.js';
import { LocationPanel } from '../components/LocationPanel.js';
import { AssetLibraryPanel } from '../components/AssetLibraryPanel.js';
import { Minimap } from '../components/Minimap.js';
import { ToolSettingsPanel, type ToolPanelPosition } from '../components/ToolSettingsPanel.js';
import { UserConfigDialog } from '../components/UserConfigDialog.js';
import { TerrainBrushPicker } from '../components/TerrainBrushPicker.js';
import {
  PixiCanvas,
  type CanvasTelemetry,
  type PixiCanvasHandle,
} from '../components/PixiCanvas.js';
import { loadMapIntoStore } from '../services/map-loader.js';
import { readableError } from '../services/api-client.js';
import { useEditorStore, type EditorTool } from '../stores/editor-store.js';
import { useMapStore } from '../stores/map-store.js';
import { useSessionStore } from '../stores/session-store.js';
import { CommandManager } from '../editor/commands/CommandManager.js';
import { UpdateMapMetadataCommand } from '../editor/commands/commands.js';
import { createMapCommandContext } from '../editor/commands/map-command-context.js';
import { handleHistoryShortcut } from '../editor/commands/shortcuts.js';
import {
  deleteSelectedObjects,
  duplicateObjects,
  moveSelectionInStack,
  selectedObjects,
} from '../editor/object-actions.js';
import { useEditorAutosave } from '../editor/autosave/use-editor-autosave.js';
import { downloadPngBlob } from '../exports/png-exporter.js';
import { themeRegistry } from '../themes/ThemeRegistry.js';

const toolInfo: {
  id: EditorTool;
  icon: 'select' | 'pan' | 'stamp' | 'brush' | 'eraser' | 'path' | 'region' | 'text' | 'map';
  label: string;
  key: string;
}[] = [
  { id: 'select', icon: 'select', label: '选择', key: 'V' },
  { id: 'pan', icon: 'pan', label: '平移', key: 'H' },
  { id: 'stamp', icon: 'stamp', label: '图章', key: 'S' },
  { id: 'terrain-brush', icon: 'brush', label: '地形笔刷', key: 'B' },
  { id: 'terrain-eraser', icon: 'eraser', label: '地形橡皮擦', key: 'E' },
  { id: 'road', icon: 'path', label: '道路', key: 'R' },
  { id: 'river', icon: 'path', label: '河流', key: 'W' },
  { id: 'region', icon: 'region', label: '区域', key: 'P' },
  { id: 'text', icon: 'text', label: '文字', key: 'T' },
  { id: 'location', icon: 'map', label: '地点', key: 'L' },
];

const saveLabels = {
  saved: '已保存',
  dirty: '有未保存更改',
  saving: '正在保存',
  offline: '离线，已保存在本机',
  error: '保存失败，将重试',
  conflict: '版本冲突',
} as const;

export function EditorPage() {
  const { mapId = '' } = useParams();
  const session = useSessionStore((state) => state.session);
  const document = useMapStore((state) => state.document);
  const objectCount = useMapStore((state) => Object.keys(state.objectsById).length);
  const objects = useMapStore((state) => state.objectsById);
  const clearMap = useMapStore((state) => state.clear);
  const tool = useEditorStore((state) => state.tool);
  const activeStampAssetId = useEditorStore((state) => state.activeStampAssetId);
  const terrainBrush = useEditorStore((state) => state.terrainBrush);
  const geometryStyle = useEditorStore((state) => state.geometryStyle);
  const textDraft = useEditorStore((state) => state.textDraft);
  const locationDraft = useEditorStore((state) => state.locationDraft);
  const setTerrainBrush = useEditorStore((state) => state.setTerrainBrush);
  const setGeometryStyle = useEditorStore((state) => state.setGeometryStyle);
  const setTextDraft = useEditorStore((state) => state.setTextDraft);
  const setLocationDraft = useEditorStore((state) => state.setLocationDraft);
  const setTool = useEditorStore((state) => state.setTool);
  const leftPanelOpen = useEditorStore((state) => state.leftPanelOpen);
  const rightPanelOpen = useEditorStore((state) => state.rightPanelOpen);
  const toggleLeftPanel = useEditorStore((state) => state.toggleLeftPanel);
  const toggleRightPanel = useEditorStore((state) => state.toggleRightPanel);
  const [rightTab, setRightTab] = useState<'layers' | 'properties' | 'locations'>('layers');
  const [userConfigOpen, setUserConfigOpen] = useState(false);
  const [toolControlsOpen, setToolControlsOpen] = useState(true);
  const [toolPanelPosition, setToolPanelPosition] = useState<ToolPanelPosition>({ x: 16, y: 16 });
  const stageRef = useRef<HTMLElement>(null);
  const canvasHandle = useRef<PixiCanvasHandle | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportMaxTextureSize, setExportMaxTextureSize] = useState<number | null | undefined>(
    undefined,
  );
  const clipboardRef = useRef<readonly MapObject[]>([]);
  const [interactionError, setInteractionError] = useState<string | null>(null);
  const commandManagerRef = useRef<CommandManager | null>(null);
  if (!commandManagerRef.current) {
    commandManagerRef.current = new CommandManager(createMapCommandContext());
  }
  const commandManager = commandManagerRef.current;
  const history = useSyncExternalStore(
    commandManager.subscribe,
    commandManager.getSnapshot,
    commandManager.getSnapshot,
  );
  const autosave = useEditorAutosave({ document, session, commandManager });
  const [telemetry, setTelemetry] = useState<CanvasTelemetry>({
    camera: { x: 0, y: 0, zoom: 1 },
    pointerWorld: null,
    fps: 0,
    visibleObjectCount: 0,
  });
  const onCanvasReady = useCallback((handle: PixiCanvasHandle) => {
    canvasHandle.current = handle;
    setExportMaxTextureSize(handle.getExportMaxTextureSize());
  }, []);
  const onTelemetry = useCallback((next: CanvasTelemetry) => setTelemetry(next), []);
  const openExportDialog = useCallback(() => {
    setExportError(null);
    setExportDialogOpen(true);
  }, []);
  const closeExportDialog = useCallback(() => {
    if (exporting) return;
    setExportDialogOpen(false);
    setExportError(null);
  }, [exporting]);
  const exportPng = useCallback(async (longEdge: number) => {
    const canvas = canvasHandle.current;
    if (!canvas) {
      setExportError('地图画布仍在初始化，请稍后再试。');
      return;
    }
    setExporting(true);
    setExportError(null);
    try {
      const result = await canvas.exportPng(longEdge);
      downloadPngBlob(result.blob, result.filename);
      setExportDialogOpen(false);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : '导出失败，请稍后重试。');
    } finally {
      setExporting(false);
    }
  }, []);
  const changeTheme = useCallback(
    (themeId: string) => {
      commandManager.execute(
        new UpdateMapMetadataCommand({ type: 'map.update', changes: { themeId } }),
      );
    },
    [commandManager],
  );
  const query = useQuery({
    queryKey: ['map-load', mapId],
    queryFn: () => loadMapIntoStore(session?.accessToken ?? '', mapId),
    enabled: Boolean(session && mapId),
    staleTime: 30_000,
  });

  useEffect(() => {
    // Avoid clearing a same-map response that resolved between render and this
    // effect; on route changes, stale document state still clears immediately.
    if (useMapStore.getState().document?.id !== mapId) clearMap();
    commandManager.clear();
    return clearMap;
  }, [mapId, clearMap, commandManager]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (handleHistoryShortcut(event, commandManager)) return;
      const target = event.target;
      if (
        event.isComposing ||
        (target instanceof HTMLElement &&
          (target.isContentEditable ||
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement))
      )
        return;
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (modifier && key === 'c') {
        clipboardRef.current = selectedObjects().map((object) => structuredClone(object));
        event.preventDefault();
      } else if (modifier && key === 'v') {
        duplicateObjects(commandManager, clipboardRef.current);
        event.preventDefault();
      } else if (modifier && key === 'd') {
        duplicateObjects(commandManager);
        event.preventDefault();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (deleteSelectedObjects(commandManager)) event.preventDefault();
      } else if (event.key === ']') {
        if (moveSelectionInStack(commandManager, 'forward')) event.preventDefault();
      } else if (event.key === '[') {
        if (moveSelectionInStack(commandManager, 'backward')) event.preventDefault();
      } else if (
        !modifier &&
        !event.altKey &&
        ['v', 'h', 's', 'r', 'w', 'p', 't', 'l', 'b', 'e'].includes(key)
      ) {
        const shortcuts: Record<string, EditorTool> = {
          v: 'select',
          h: 'pan',
          s: 'stamp',
          b: 'terrain-brush',
          e: 'terrain-eraser',
          r: 'road',
          w: 'river',
          p: 'region',
          t: 'text',
          l: 'location',
        };
        setTool(shortcuts[key]!);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commandManager, setTool]);
  if (!session) return <Navigate to="/login" replace />;
  if (query.isError)
    return (
      <main className="editor-error">
        <Brand />
        <ErrorState message={readableError(query.error)} onRetry={() => void query.refetch()} />
      </main>
    );
  if (query.isPending || !document) return <LoadingState editor />;
  const resolvedTheme = themeRegistry.resolve(document.themeId);

  return (
    <main
      className={`editor-shell route-enter ${leftPanelOpen ? '' : 'editor-shell--left-closed'} ${rightPanelOpen ? '' : 'editor-shell--right-closed'}`}
    >
      <header className="editor-topbar">
        <Brand compact />
        <Link
          className="editor-back"
          to="/"
          aria-label="返回地图室"
          onClick={(event) => {
            if (!autosave.confirmNavigation()) event.preventDefault();
          }}
        >
          <Icon name="back" />
        </Link>
        <div className="editor-title">
          <span>{document.projectId.slice(0, 8)}</span>
          <h1>{document.name}</h1>
        </div>
        <div className="editor-topbar__center">
          <button
            disabled={!history.canUndo}
            onClick={() => commandManager.undo()}
            aria-label="撤销"
          >
            ↶
          </button>
          <button
            disabled={!history.canRedo}
            onClick={() => commandManager.redo()}
            aria-label="重做"
          >
            ↷
          </button>
        </div>
        <button
          className={`editor-save editor-save--${autosave.snapshot.status}`}
          data-testid="save-status"
          onClick={autosave.retrySave}
          disabled={!['offline', 'error'].includes(autosave.snapshot.status)}
          title={autosave.snapshot.errorMessage ?? undefined}
        >
          <i />
          {saveLabels[autosave.snapshot.status]} <span>R{document.revision}</span>
        </button>
        <button
          className="button button--export"
          onClick={openExportDialog}
          disabled={exportMaxTextureSize === undefined}
        >
          导出
        </button>
        <label className="theme-select">
          <span>主题</span>
          <select value={document.themeId} onChange={(event) => changeTheme(event.target.value)}>
            {themeRegistry.list().map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.displayName}
              </option>
            ))}
          </select>
        </label>
        <button
          className="avatar avatar--small"
          onClick={() => setUserConfigOpen(true)}
          aria-label="打开用户配置"
          title="用户配置"
        >
          {session.user.displayName.slice(0, 1)}
        </button>
      </header>
      <aside
        className={`editor-assets panel-slide ${leftPanelOpen ? 'is-open' : ''}`}
        aria-hidden={!leftPanelOpen}
      >
        <AssetLibraryPanel onClose={toggleLeftPanel} />
      </aside>
      {!leftPanelOpen && (
        <button
          className="panel-reopen panel-reopen--left"
          onClick={toggleLeftPanel}
          aria-label="展开素材面板"
        >
          <Icon name="chevron" />
        </button>
      )}
      <nav className="tool-rail" aria-label="编辑工具">
        {toolInfo.map((item) => (
          <button
            className={tool === item.id ? 'active' : ''}
            key={item.id}
            onClick={() => setTool(item.id)}
            aria-label={item.label}
          >
            <Icon name={item.icon} />
            <span>
              {item.label}
              <kbd>{item.key}</kbd>
            </span>
          </button>
        ))}
        <i />
        <button disabled aria-label="网格">
          <Icon name="grid" />
          <span>
            网格<kbd>G</kbd>
          </span>
        </button>
      </nav>
      <section ref={stageRef} className="editor-stage" aria-label="地图工作区">
        <PixiCanvas
          document={document}
          tool={tool}
          activeStampAssetId={activeStampAssetId}
          commandManager={commandManager}
          onReady={onCanvasReady}
          onTelemetry={onTelemetry}
          onInteractionError={setInteractionError}
        />
        <div className="stage-grain" />
        {(tool === 'terrain-brush' || tool === 'terrain-eraser') && (
          <ToolSettingsPanel
            containerRef={stageRef}
            title={tool === 'terrain-eraser' ? '地形橡皮擦设置' : '地形笔刷设置'}
            open={toolControlsOpen}
            position={toolPanelPosition}
            onOpenChange={setToolControlsOpen}
            onPositionChange={setToolPanelPosition}
          >
            <label>
              <span>模式</span>
              <strong>{tool === 'terrain-eraser' ? '整笔擦除' : '像素级绘制'}</strong>
            </label>
            {tool === 'terrain-brush' && (
              <TerrainBrushPicker onManage={() => setUserConfigOpen(true)} />
            )}
            <label>
              <span>
                半径 <b>{terrainBrush.radius}</b>
              </span>
              <input
                type="range"
                min="1"
                max="256"
                step="1"
                value={terrainBrush.radius}
                onChange={(event) => setTerrainBrush({ radius: Number(event.target.value) })}
              />
            </label>
            {tool === 'terrain-brush' && (
              <>
                <label>
                  <span>
                    不透明度 <b>{Math.round(terrainBrush.opacity * 100)}%</b>
                  </span>
                  <input
                    type="range"
                    min="0.01"
                    max="1"
                    step="0.01"
                    value={terrainBrush.opacity}
                    onChange={(event) => setTerrainBrush({ opacity: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>
                    硬度 <b>{Math.round(terrainBrush.hardness * 100)}%</b>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={terrainBrush.hardness}
                    onChange={(event) => setTerrainBrush({ hardness: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>
                    采样间距 <b>{terrainBrush.spacing}</b>
                  </span>
                  <input
                    type="range"
                    min="0.25"
                    max="32"
                    step="0.25"
                    value={terrainBrush.spacing}
                    onChange={(event) => setTerrainBrush({ spacing: Number(event.target.value) })}
                  />
                </label>
              </>
            )}
            <small>
              {tool === 'terrain-eraser'
                ? '拖动经过任意地形笔迹时，将删除整条笔迹；一次拖动可撤销一次。'
                : '输入按屏幕像素捕获，并按世界距离重采样；松开指针后才写入历史与保存队列。'}
            </small>
          </ToolSettingsPanel>
        )}
        {(tool === 'road' || tool === 'river' || tool === 'region') && (
          <ToolSettingsPanel
            containerRef={stageRef}
            title="绘图设置"
            open={toolControlsOpen}
            position={toolPanelPosition}
            onOpenChange={setToolControlsOpen}
            onPositionChange={setToolPanelPosition}
          >
            <label>
              <span>绘制方式</span>
              <strong>{tool === 'region' ? '自由套索区域' : '自由手绘路径'}</strong>
            </label>
            {tool === 'road' && (
              <label>
                <span>
                  道路粗细 <b>{geometryStyle.roadWidth}</b>
                </span>
                <input
                  type="range"
                  min="1"
                  max="80"
                  step="1"
                  value={geometryStyle.roadWidth}
                  onChange={(event) => setGeometryStyle({ roadWidth: Number(event.target.value) })}
                />
              </label>
            )}
            {tool === 'river' && (
              <label>
                <span>
                  河流粗细 <b>{geometryStyle.riverWidth}</b>
                </span>
                <input
                  type="range"
                  min="1"
                  max="120"
                  step="1"
                  value={geometryStyle.riverWidth}
                  onChange={(event) => setGeometryStyle({ riverWidth: Number(event.target.value) })}
                />
              </label>
            )}
            {tool === 'region' && (
              <label>
                <span>
                  边界粗细 <b>{geometryStyle.regionStrokeWidth}</b>
                </span>
                <input
                  type="range"
                  min="1"
                  max="40"
                  step="1"
                  value={geometryStyle.regionStrokeWidth}
                  onChange={(event) =>
                    setGeometryStyle({ regionStrokeWidth: Number(event.target.value) })
                  }
                />
              </label>
            )}
            <label>
              <span>
                不透明度 <b>{Math.round(geometryStyle.opacity * 100)}%</b>
              </span>
              <input
                type="range"
                min="0.05"
                max="1"
                step="0.05"
                value={geometryStyle.opacity}
                onChange={(event) => setGeometryStyle({ opacity: Number(event.target.value) })}
              />
            </label>
            <small>单击开始，移动鼠标按真实轨迹绘制，再次单击完成；Esc 取消。</small>
          </ToolSettingsPanel>
        )}
        {(tool === 'text' || tool === 'location') && (
          <ToolSettingsPanel
            containerRef={stageRef}
            title={tool === 'text' ? '文字设置' : '地点资料'}
            open={toolControlsOpen}
            position={toolPanelPosition}
            onOpenChange={setToolControlsOpen}
            onPositionChange={setToolPanelPosition}
          >
            {tool === 'text' ? (
              <>
                <label>
                  <span>文字</span>
                  <textarea
                    value={textDraft.text}
                    onChange={(event) => setTextDraft({ text: event.target.value })}
                  />
                </label>
                <label>
                  <span>
                    字号 <b>{textDraft.fontSize}</b>
                  </span>
                  <input
                    type="range"
                    min="4"
                    max="160"
                    value={textDraft.fontSize}
                    onChange={(event) => setTextDraft({ fontSize: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>对齐</span>
                  <select
                    value={textDraft.align}
                    onChange={(event) =>
                      setTextDraft({ align: event.target.value as typeof textDraft.align })
                    }
                  >
                    <option value="left">左</option>
                    <option value="center">中</option>
                    <option value="right">右</option>
                  </select>
                </label>
              </>
            ) : (
              <>
                <label>
                  <span>名称</span>
                  <input
                    value={locationDraft.name}
                    onChange={(event) => setLocationDraft({ name: event.target.value })}
                  />
                </label>
                <label>
                  <span>类型</span>
                  <input
                    value={locationDraft.type}
                    onChange={(event) =>
                      setLocationDraft({
                        type: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                      })
                    }
                  />
                </label>
                <label>
                  <span>摘要</span>
                  <textarea
                    value={locationDraft.summary}
                    onChange={(event) => setLocationDraft({ summary: event.target.value })}
                  />
                </label>
                <label>
                  <span>详情（纯文本）</span>
                  <textarea
                    value={locationDraft.description}
                    onChange={(event) => setLocationDraft({ description: event.target.value })}
                  />
                </label>
                <label>
                  <span>标签（逗号分隔）</span>
                  <input
                    value={locationDraft.tags}
                    onChange={(event) => setLocationDraft({ tags: event.target.value })}
                  />
                </label>
              </>
            )}
            <small>设置内容后，在画布上单击放置。</small>
          </ToolSettingsPanel>
        )}
        {interactionError && (
          <div className="stage-error" role="alert">
            {interactionError}
          </div>
        )}
        {resolvedTheme.usedFallback && (
          <div className="stage-warning" role="status">
            主题“{document.themeId}”不可用，当前正使用“{resolvedTheme.definition.displayName}
            ”。请选择内置主题以恢复。
          </div>
        )}
        {autosave.multiTabWarning && (
          <div className="stage-warning" role="status">
            {autosave.multiTabWarning}
          </div>
        )}
        <div className="stage-metadata" aria-hidden="true">
          <span>WORLD EXTENT</span>
          <strong>
            {document.width.toLocaleString()} × {document.height.toLocaleString()}
          </strong>
        </div>
        {objectCount === 0 && (
          <div className="stage-empty" aria-hidden="true">
            <i />
            <span>{document.name}</span>
            <small>滚轮缩放 · 中键或空格拖动</small>
          </div>
        )}
        <div className="stage-fit">
          <button onClick={() => canvasHandle.current?.fitMap()} aria-label="适应地图">
            <Icon name="map" />
            <span>适应地图</span>
          </button>
        </div>
        <div className="zoom-control">
          <button onClick={() => canvasHandle.current?.zoomOut()} aria-label="缩小">
            <Icon name="minus" />
          </button>
          <span>{Math.round(telemetry.camera.zoom * 100)}%</span>
          <button onClick={() => canvasHandle.current?.zoomIn()} aria-label="放大">
            <Icon name="plus" />
          </button>
        </div>
        <Minimap
          document={document}
          objects={objects}
          camera={telemetry.camera}
          canvasViewport={{
            width: stageRef.current?.clientWidth ?? 1,
            height: stageRef.current?.clientHeight ?? 1,
          }}
          theme={resolvedTheme.tokens}
          onCenterAt={(point) => canvasHandle.current?.centerAt(point)}
        />
      </section>
      <aside
        className={`editor-inspector panel-slide panel-slide--right ${rightPanelOpen ? 'is-open' : ''}`}
        aria-hidden={!rightPanelOpen}
      >
        <div className="inspector-tabs">
          <button
            className={rightTab === 'layers' ? 'active' : ''}
            onClick={() => setRightTab('layers')}
          >
            图层
          </button>
          <button
            className={rightTab === 'locations' ? 'active' : ''}
            onClick={() => setRightTab('locations')}
          >
            地点
          </button>
          <button
            className={rightTab === 'properties' ? 'active' : ''}
            onClick={() => setRightTab('properties')}
          >
            属性
          </button>
          <button className="icon-button" onClick={toggleRightPanel} aria-label="收起属性面板">
            <Icon name="chevron" />
          </button>
        </div>
        <div key={rightTab} className="tab-content tab-enter">
          {rightTab === 'layers' ? (
            <LayerPanel commandManager={commandManager} />
          ) : rightTab === 'properties' ? (
            <ObjectInspector commandManager={commandManager} />
          ) : (
            <LocationPanel
              commandManager={commandManager}
              onLocate={(point) => canvasHandle.current?.focusAt(point)}
            />
          )}
        </div>
        <div className="inspector-footer">
          <button>
            <Icon name="settings" />
            地图设置
          </button>
        </div>
      </aside>
      {!rightPanelOpen && (
        <button
          className="panel-reopen panel-reopen--right"
          onClick={toggleRightPanel}
          aria-label="展开属性面板"
        >
          <Icon name="back" />
        </button>
      )}
      <footer className="editor-status">
        <span>工具：{toolInfo.find((item) => item.id === tool)?.label}</span>
        <i />
        <span
          data-testid="world-coordinates"
          data-camera-x={telemetry.camera.x}
          data-camera-y={telemetry.camera.y}
        >
          X {Math.round(telemetry.pointerWorld?.x ?? telemetry.camera.x)}&nbsp;&nbsp; Y{' '}
          {Math.round(telemetry.pointerWorld?.y ?? telemetry.camera.y)}
        </span>
        <i />
        <span data-testid="camera-zoom" data-camera-zoom={telemetry.camera.zoom}>
          ZOOM {Math.round(telemetry.camera.zoom * 100)}%
        </span>
        <i />
        <span data-testid="renderer-fps">{telemetry.fps || '—'} FPS</span>
        <i />
        <span data-testid="visible-object-count">
          {telemetry.visibleObjectCount.toLocaleString()} / {objectCount.toLocaleString()}{' '}
          个可见对象
        </span>
        <i />
        <span data-testid="pending-operation-count">
          {autosave.snapshot.pendingOperations} 个待保存操作
        </span>
        <i />
        <span>{saveLabels[autosave.snapshot.status]}</span>
        <span className="editor-status__schema">SCHEMA V{document.schemaVersion}</span>
      </footer>
      {exportDialogOpen && exportMaxTextureSize !== undefined && (
        <ExportDialog
          document={document}
          maxTextureSize={exportMaxTextureSize}
          exporting={exporting}
          error={exportError}
          onClose={closeExportDialog}
          onExport={(longEdge) => void exportPng(longEdge)}
        />
      )}
      <div className="minimum-size">
        <Icon name="map" />
        <h2>需要更宽阔的制图台</h2>
        <p>编辑器最低需要 980 × 620 的窗口空间。放大窗口后即可继续。</p>
      </div>
      {(autosave.initializing || autosave.recoveryPrompt) && (
        <div className="recovery-backdrop" role="presentation">
          <section
            className="recovery-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="recovery-title"
          >
            <p className="kicker">LOCAL RECOVERY</p>
            <h2 id="recovery-title">
              {autosave.initializing ? '正在检查本机更改' : '发现未提交的地图更改'}
            </h2>
            <p>
              {autosave.initializing
                ? '正在核对 IndexedDB 日志与服务端 revision…'
                : autosave.recoveryPrompt?.message}
            </p>
            {!autosave.initializing && autosave.recoveryPrompt && (
              <div>
                {autosave.recoveryPrompt.kind === 'recoverable' ? (
                  <button className="button button--primary" onClick={autosave.recover}>
                    恢复更改
                  </button>
                ) : (
                  <button className="button" onClick={autosave.retryRecovery}>
                    重试检查
                  </button>
                )}
                <button className="button recovery-discard" onClick={() => void autosave.discard()}>
                  丢弃本机日志
                </button>
              </div>
            )}
          </section>
        </div>
      )}
      <UserConfigDialog open={userConfigOpen} onClose={() => setUserConfigOpen(false)} />
    </main>
  );
}

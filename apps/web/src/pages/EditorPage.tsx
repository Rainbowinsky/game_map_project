import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useParams } from 'react-router-dom';

import { Brand } from '../components/Brand.js';
import { ErrorState } from '../components/ErrorState.js';
import { Icon } from '../components/Icon.js';
import { LoadingState } from '../components/LoadingState.js';
import { LayerPanel } from '../components/LayerPanel.js';
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
import { createMapCommandContext } from '../editor/commands/map-command-context.js';
import { handleHistoryShortcut } from '../editor/commands/shortcuts.js';

const toolInfo: { id: EditorTool; icon: 'select' | 'pan' | 'stamp'; label: string; key: string }[] =
  [
    { id: 'select', icon: 'select', label: '选择', key: 'V' },
    { id: 'pan', icon: 'pan', label: '平移', key: 'H' },
    { id: 'stamp', icon: 'stamp', label: '图章', key: 'S' },
  ];

export function EditorPage() {
  const { mapId = '' } = useParams();
  const session = useSessionStore((state) => state.session);
  const document = useMapStore((state) => state.document);
  const objectCount = useMapStore((state) => Object.keys(state.objectsById).length);
  const clearMap = useMapStore((state) => state.clear);
  const setSaveStatus = useEditorStore((state) => state.setSaveStatus);
  const tool = useEditorStore((state) => state.tool);
  const setTool = useEditorStore((state) => state.setTool);
  const leftPanelOpen = useEditorStore((state) => state.leftPanelOpen);
  const rightPanelOpen = useEditorStore((state) => state.rightPanelOpen);
  const toggleLeftPanel = useEditorStore((state) => state.toggleLeftPanel);
  const toggleRightPanel = useEditorStore((state) => state.toggleRightPanel);
  const [rightTab, setRightTab] = useState<'layers' | 'properties'>('layers');
  const canvasHandle = useRef<PixiCanvasHandle | null>(null);
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
  const [telemetry, setTelemetry] = useState<CanvasTelemetry>({
    camera: { x: 0, y: 0, zoom: 1 },
    pointerWorld: null,
    fps: 0,
  });
  const onCanvasReady = useCallback((handle: PixiCanvasHandle) => {
    canvasHandle.current = handle;
  }, []);
  const onTelemetry = useCallback((next: CanvasTelemetry) => setTelemetry(next), []);
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
    setSaveStatus('saved');
    return clearMap;
  }, [mapId, clearMap, commandManager, setSaveStatus]);
  useEffect(
    () =>
      commandManager.patches.subscribe(() => {
        setSaveStatus('dirty');
      }),
    [commandManager, setSaveStatus],
  );
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      handleHistoryShortcut(event, commandManager);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commandManager]);
  if (!session) return <Navigate to="/login" replace />;
  if (query.isError)
    return (
      <main className="editor-error">
        <Brand />
        <ErrorState message={readableError(query.error)} onRetry={() => void query.refetch()} />
      </main>
    );
  if (query.isPending || !document) return <LoadingState editor />;

  return (
    <main
      className={`editor-shell route-enter ${leftPanelOpen ? '' : 'editor-shell--left-closed'} ${rightPanelOpen ? '' : 'editor-shell--right-closed'}`}
    >
      <header className="editor-topbar">
        <Brand compact />
        <Link className="editor-back" to="/" aria-label="返回地图室">
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
        <div className="editor-save">
          <i />
          已同步 <span>R{document.revision}</span>
        </div>
        <button className="button button--export" disabled>
          导出
        </button>
        <button className="avatar avatar--small">{session.user.displayName.slice(0, 1)}</button>
      </header>
      <aside
        className={`editor-assets panel-slide ${leftPanelOpen ? 'is-open' : ''}`}
        aria-hidden={!leftPanelOpen}
      >
        <div className="panel-heading">
          <div>
            <p className="kicker">ASSET LIBRARY</p>
            <h2>素材</h2>
          </div>
          <button className="icon-button" onClick={toggleLeftPanel} aria-label="收起素材面板">
            <Icon name="back" />
          </button>
        </div>
        <label className="panel-search">
          <Icon name="search" />
          <input placeholder="搜索图章" disabled />
        </label>
        <div className="asset-category">
          <button className="active">
            <span className="asset-swatch asset-swatch--mountain">⌁</span>
            <span>山脉</span>
            <small>即将开放</small>
          </button>
          <button>
            <span className="asset-swatch asset-swatch--tree">♧</span>
            <span>森林</span>
            <small>即将开放</small>
          </button>
          <button>
            <span className="asset-swatch asset-swatch--town">◇</span>
            <span>城镇</span>
            <small>即将开放</small>
          </button>
        </div>
        <div className="panel-note">
          <Icon name="command" />
          <p>P9 将在这里接入可拖放的原创地图素材。</p>
        </div>
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
      <section className="editor-stage" aria-label="地图工作区">
        <PixiCanvas
          document={document}
          panMode={tool === 'pan'}
          patchBus={commandManager.patches}
          onReady={onCanvasReady}
          onTelemetry={onTelemetry}
        />
        <div className="stage-grain" />
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
          ) : (
            <div className="properties-empty">
              <span>
                <Icon name="select" />
              </span>
              <h3>尚未选择对象</h3>
              <p>在画布中选择图章后，属性会在这里展开。</p>
            </div>
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
        <span data-testid="world-coordinates">
          X {Math.round(telemetry.pointerWorld?.x ?? telemetry.camera.x)}&nbsp;&nbsp; Y{' '}
          {Math.round(telemetry.pointerWorld?.y ?? telemetry.camera.y)}
        </span>
        <i />
        <span data-testid="camera-zoom" data-camera-zoom={telemetry.camera.zoom}>
          ZOOM {Math.round(telemetry.camera.zoom * 100)}%
        </span>
        <i />
        <span>{telemetry.fps || '—'} FPS</span>
        <i />
        <span>{objectCount} 个对象</span>
        <span className="editor-status__schema">SCHEMA V{document.schemaVersion}</span>
      </footer>
      <div className="minimum-size">
        <Icon name="map" />
        <h2>需要更宽阔的制图台</h2>
        <p>编辑器最低需要 980 × 620 的窗口空间。放大窗口后即可继续。</p>
      </div>
    </main>
  );
}

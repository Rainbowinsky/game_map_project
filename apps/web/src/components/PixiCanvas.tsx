import { useEffect, useRef } from 'react';
import type { CameraState, MapDocument, ScreenPoint, WorldPoint } from '@fantasy-map/map-model';

import { CameraController, type CameraSnapshot } from '../camera/CameraController.js';
import { MapRenderer } from '../renderer/MapRenderer.js';
import type { PatchBus } from '../editor/commands/patch-bus.js';
import { useMapStore } from '../stores/map-store.js';

export interface CanvasTelemetry {
  readonly camera: CameraState;
  readonly pointerWorld: WorldPoint | null;
  readonly fps: number;
}

export interface PixiCanvasHandle {
  zoomIn(): void;
  zoomOut(): void;
  fitMap(animate?: boolean): void;
}

interface PixiCanvasProps {
  readonly document: MapDocument;
  readonly panMode: boolean;
  readonly patchBus: PatchBus;
  readonly onReady?: (handle: PixiCanvasHandle) => void;
  readonly onTelemetry: (telemetry: CanvasTelemetry) => void;
}

function localPoint(event: PointerEvent | WheelEvent, element: HTMLElement): ScreenPoint {
  const bounds = element.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

export function PixiCanvas({ document, panMode, patchBus, onReady, onTelemetry }: PixiCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const initialDocumentRef = useRef(document);
  if (initialDocumentRef.current.id !== document.id) initialDocumentRef.current = document;
  const panModeRef = useRef(panMode);
  panModeRef.current = panMode;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const initialDocument = initialDocumentRef.current;

    let disposed = false;
    let spacePressed = false;
    let dragging = false;
    let lastPointer: ScreenPoint | null = null;
    let pointerWorld: WorldPoint | null = null;
    let telemetryCamera: CameraState = { x: 0, y: 0, zoom: 1 };
    let telemetryTimer = 0;
    const renderer = new MapRenderer(initialDocument);
    const unsubscribeProjection = patchBus.subscribe(() => {
      renderer.syncLayers(Object.values(useMapStore.getState().layersById));
    });
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const controller = new CameraController({
      minZoom: initialDocument.settings.camera.minZoom,
      maxZoom: initialDocument.settings.camera.maxZoom,
      onChange: ({ camera }: CameraSnapshot) => {
        telemetryCamera = camera;
        renderer.setCamera(camera);
        if (lastPointer) pointerWorld = controller.screenToWorld(lastPointer);
        scheduleTelemetry();
      },
    });

    const scheduleTelemetry = () => {
      if (telemetryTimer) return;
      telemetryTimer = window.setTimeout(() => {
        telemetryTimer = 0;
        onTelemetry({ camera: telemetryCamera, pointerWorld, fps: renderer.getFps() });
      }, 100);
    };

    const resize = () => {
      const viewport = {
        width: Math.max(1, host.clientWidth),
        height: Math.max(1, host.clientHeight),
      };
      renderer.resize(viewport);
      controller.setViewport(viewport);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const point = localPoint(event, host);
      lastPointer = point;
      controller.zoomAt(
        point,
        event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaY,
      );
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 1 && !(event.button === 0 && (spacePressed || panModeRef.current)))
        return;
      event.preventDefault();
      dragging = true;
      lastPointer = localPoint(event, host);
      if (event.isTrusted) host.setPointerCapture(event.pointerId);
      host.classList.add('is-panning');
    };
    const onPointerMove = (event: PointerEvent) => {
      const point = localPoint(event, host);
      if (dragging && lastPointer)
        controller.panByScreen(point.x - lastPointer.x, point.y - lastPointer.y);
      lastPointer = point;
      pointerWorld = controller.screenToWorld(point);
      telemetryCamera = controller.getSnapshot().camera;
      scheduleTelemetry();
    };
    const endPan = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      controller.flush();
      if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
      host.classList.remove('is-panning');
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.code === 'Space' &&
        !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
      ) {
        spacePressed = true;
        host.classList.add('is-pan-ready');
        event.preventDefault();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        spacePressed = false;
        host.classList.remove('is-pan-ready');
      }
    };

    host.addEventListener('wheel', onWheel, { passive: false });
    host.addEventListener('pointerdown', onPointerDown);
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerup', endPan);
    host.addEventListener('pointercancel', endPan);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    void renderer.mount(host).then(() => {
      if (disposed) return;
      resize();
      controller.fit(
        { x: 0, y: 0, width: initialDocument.width, height: initialDocument.height },
        72,
        false,
      );
      onReady?.({
        zoomIn: () => controller.zoomBy(1.25),
        zoomOut: () => controller.zoomBy(0.8),
        fitMap: (animate = true) =>
          controller.fit(
            { x: 0, y: 0, width: initialDocument.width, height: initialDocument.height },
            72,
            animate && !reducedMotion,
          ),
      });
    });

    return () => {
      disposed = true;
      observer.disconnect();
      host.removeEventListener('wheel', onWheel);
      host.removeEventListener('pointerdown', onPointerDown);
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerup', endPan);
      host.removeEventListener('pointercancel', endPan);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      if (telemetryTimer) window.clearTimeout(telemetryTimer);
      controller.destroy();
      unsubscribeProjection();
      renderer.destroy();
    };
  }, [document.id, onReady, onTelemetry, patchBus]);

  return (
    <div
      className={`pixi-host ${panMode ? 'is-pan-tool' : ''}`}
      ref={hostRef}
      data-testid="pixi-host"
    />
  );
}

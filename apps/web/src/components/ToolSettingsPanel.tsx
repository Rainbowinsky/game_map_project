import {
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';

import { Icon } from './Icon.js';

export interface ToolPanelPosition {
  readonly x: number;
  readonly y: number;
}

interface ToolSettingsPanelProps {
  readonly containerRef: RefObject<HTMLElement | null>;
  readonly title: string;
  readonly open: boolean;
  readonly position: ToolPanelPosition;
  readonly onOpenChange: (open: boolean) => void;
  readonly onPositionChange: (position: ToolPanelPosition) => void;
  readonly children: ReactNode;
}

interface DragState {
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  moved: boolean;
}

const EDGE_PADDING = 8;

export function ToolSettingsPanel({
  containerRef,
  title,
  open,
  position,
  onOpenChange,
  onPositionChange,
  children,
}: ToolSettingsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const collapseButtonRef = useRef<HTMLButtonElement>(null);
  const reopenButtonRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const style = {
    '--tool-panel-x': `${position.x}px`,
    '--tool-panel-y': `${position.y}px`,
  } as CSSProperties;

  const clamp = (x: number, y: number, width: number, height: number): ToolPanelPosition => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return { x, y };
    return {
      x: Math.max(
        EDGE_PADDING,
        Math.min(x, Math.max(EDGE_PADDING, bounds.width - width - EDGE_PADDING)),
      ),
      y: Math.max(
        EDGE_PADDING,
        Math.min(y, Math.max(EDGE_PADDING, bounds.height - height - EDGE_PADDING)),
      ),
    };
  };

  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const target = open ? panelRef.current : event.currentTarget;
    if (!target) return;
    const bounds = target.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      x: position.x,
      y: position.y,
      width: bounds.width,
      height: bounds.height,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.clientX;
    const dy = event.clientY - drag.clientY;
    if (Math.hypot(dx, dy) >= 4) drag.moved = true;
    onPositionChange(clamp(drag.x + dx, drag.y + dy, drag.width, drag.height));
  };

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressClickRef.current = drag.moved;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  const setOpen = (next: boolean) => {
    onOpenChange(next);
    window.requestAnimationFrame(() => {
      const target = next ? panelRef.current : reopenButtonRef.current;
      if (target) {
        const bounds = target.getBoundingClientRect();
        onPositionChange(clamp(position.x, position.y, bounds.width, bounds.height));
      }
      (next ? collapseButtonRef.current : reopenButtonRef.current)?.focus();
    });
  };

  return (
    <>
      <div
        ref={panelRef}
        id="active-tool-settings"
        className={`terrain-controls tool-settings-panel ${open ? 'is-expanded' : 'is-collapsed'}`}
        data-testid="tool-settings-panel"
        role="group"
        aria-label={title}
        style={style}
      >
        <div
          className="tool-settings-panel__header"
          data-testid="tool-settings-drag-handle"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span aria-hidden="true">⠿</span>
          <strong>{title}</strong>
          <button
            ref={collapseButtonRef}
            type="button"
            aria-label={`收起${title}`}
            aria-controls="active-tool-settings"
            aria-expanded={open}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setOpen(false)}
          >
            <Icon name="chevron" />
          </button>
        </div>
        {children}
      </div>
      <button
        ref={reopenButtonRef}
        className={`tool-settings-reopen ${open ? 'is-hidden' : 'is-visible'}`}
        data-testid="tool-settings-reopen"
        type="button"
        aria-label={`展开${title}`}
        aria-controls="active-tool-settings"
        aria-expanded={open}
        style={style}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={() => {
          if (!suppressClickRef.current) setOpen(true);
        }}
      >
        <Icon name="settings" />
        <span>{title}</span>
      </button>
    </>
  );
}

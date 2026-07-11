import { useState } from 'react';
import type { ObjectChanges } from '@fantasy-map/map-model';

import { UpdateObjectCommand } from '../editor/commands/commands.js';
import type { CommandManager } from '../editor/commands/CommandManager.js';
import {
  deleteSelectedObjects,
  duplicateObjects,
  moveSelectionInStack,
  selectedObjects,
} from '../editor/object-actions.js';
import { useEditorStore } from '../stores/editor-store.js';
import { useMapStore } from '../stores/map-store.js';
import { Icon } from './Icon.js';

interface ObjectInspectorProps {
  readonly commandManager: CommandManager;
}

export function ObjectInspector({ commandManager }: ObjectInspectorProps) {
  const selection = useEditorStore((state) => state.selection);
  useMapStore((state) => state.objectsById);
  const [, rerender] = useState(0);
  const objects = selectedObjects();
  const object = objects.length === 1 ? objects[0] : undefined;
  const updateNumber = (key: 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY', value: string) => {
    if (!object) return;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const normalized = key === 'rotation' ? (parsed * Math.PI) / 180 : parsed;
    commandManager.execute(
      new UpdateObjectCommand(
        object.id,
        { [key]: normalized } as ObjectChanges,
        `property:${object.id}:${key}`,
      ),
    );
    rerender((version) => version + 1);
  };

  if (selection.length === 0 || objects.length === 0) {
    return (
      <div className="properties-empty">
        <span>
          <Icon name="select" />
        </span>
        <h3>尚未选择对象</h3>
        <p>点选图章，按 Shift 多选，或拖出框选区域。</p>
      </div>
    );
  }

  return (
    <div className="object-properties">
      <p className="kicker">SELECTION</p>
      <h3>{objects.length === 1 ? (object?.name ?? '未命名图章') : `${objects.length} 个图章`}</h3>
      <p>{objects.length === 1 ? object?.stampKind.toUpperCase() : 'MULTI-SELECTION'}</p>
      {object && (
        <div className="object-fields">
          {(
            [
              ['x', 'X', object.x],
              ['y', 'Y', object.y],
              ['rotation', '旋转 °', (object.rotation * 180) / Math.PI],
              ['scaleX', '水平缩放', object.scaleX],
              ['scaleY', '垂直缩放', object.scaleY],
            ] as const
          ).map(([key, label, value]) => (
            <label key={key}>
              <span>{label}</span>
              <input
                type="number"
                step={key === 'rotation' ? 1 : 0.1}
                defaultValue={Number(value.toFixed(2))}
                key={`${key}:${value}`}
                onBlur={(event) => updateNumber(key, event.currentTarget.value)}
              />
            </label>
          ))}
        </div>
      )}
      <div className="object-action-grid">
        <button onClick={() => duplicateObjects(commandManager)}>复制</button>
        <button onClick={() => moveSelectionInStack(commandManager, 'forward')}>前移</button>
        <button onClick={() => moveSelectionInStack(commandManager, 'backward')}>后移</button>
        <button className="danger" onClick={() => deleteSelectedObjects(commandManager)}>
          删除
        </button>
      </div>
      <p className="object-hint">拖动边框移动，角点缩放，顶部圆点旋转；Esc 可取消当前手势。</p>
    </div>
  );
}

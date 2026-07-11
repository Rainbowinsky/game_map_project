import { beforeEach, describe, expect, it } from 'vitest';
import {
  createMapChunkPayloadFixture,
  createMapDocumentFixture,
  createStampMapObjectFixture,
} from '@fantasy-map/map-model/fixtures';

import { useEditorStore } from '../stores/editor-store.js';
import { useMapStore } from '../stores/map-store.js';
import { CreateObjectCommand } from './commands/commands.js';
import { CommandManager } from './commands/CommandManager.js';
import { createMapCommandContext } from './commands/map-command-context.js';
import { moveSelectionInStack } from './object-actions.js';

describe('object stacking actions', () => {
  beforeEach(() => {
    useMapStore.getState().hydrate(createMapDocumentFixture(), [createMapChunkPayloadFixture()]);
    useEditorStore.getState().reset();
  });

  it('moves the selection one step and restores both objects on undo', () => {
    const manager = new CommandManager(createMapCommandContext());
    const first = createStampMapObjectFixture();
    const second = {
      ...first,
      id: '10000000-0000-4000-8000-000000000030',
      name: 'Second',
      zIndex: 1,
    };
    manager.execute(new CreateObjectCommand(second));
    manager.clear();
    useEditorStore.getState().setSelection([first.id]);

    expect(moveSelectionInStack(manager, 'forward')).toBe(true);
    expect(useMapStore.getState().objectsById[first.id]?.zIndex).toBe(1);
    expect(useMapStore.getState().objectsById[second.id]?.zIndex).toBe(0);
    expect(manager.getSnapshot().undoDepth).toBe(1);

    manager.undo();
    expect(useMapStore.getState().objectsById[first.id]?.zIndex).toBe(0);
    expect(useMapStore.getState().objectsById[second.id]?.zIndex).toBe(1);
  });
});

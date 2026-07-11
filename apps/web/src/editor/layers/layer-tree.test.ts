import { describe, expect, it } from 'vitest';
import { createMapDocumentFixture } from '@fantasy-map/map-model/fixtures';
import type { MapLayer } from '@fantasy-map/map-model';

import { flattenLayerTree, isLayerEffectivelyEditable } from './layer-tree.js';

describe('layer tree helpers', () => {
  it('preserves group descendants while presenting higher orders first', () => {
    const document = createMapDocumentFixture();
    const group: MapLayer = {
      ...document.layers[1]!,
      id: '10000000-0000-4000-8000-000000000010',
      name: 'Group',
      type: 'group',
      order: 1,
    };
    const child: MapLayer = {
      ...document.layers[1]!,
      id: '10000000-0000-4000-8000-000000000011',
      parentId: group.id,
      order: 0,
    };
    const background = { ...document.layers[0]!, order: 0 };

    expect(flattenLayerTree([background, child, group])).toEqual([
      { layer: group, depth: 0 },
      { layer: child, depth: 1 },
      { layer: background, depth: 0 },
    ]);
  });

  it('treats hidden or locked ancestors as non-editable', () => {
    const document = createMapDocumentFixture();
    const parent = {
      ...document.layers[1]!,
      id: '10000000-0000-4000-8000-000000000010',
      type: 'group' as const,
      visible: false,
    };
    const child = { ...document.layers[1]!, parentId: parent.id };
    const layers = { [parent.id]: parent, [child.id]: child };

    expect(isLayerEffectivelyEditable(child.id, layers)).toBe(false);
    expect(isLayerEffectivelyEditable('10000000-0000-4000-8000-000000000099', layers)).toBe(false);
  });
});

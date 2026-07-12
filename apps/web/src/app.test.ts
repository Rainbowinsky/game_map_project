import { describe, expect, it } from 'vitest';

import { MAP_MODEL_SCHEMA_VERSION } from '@fantasy-map/map-model';
import { WORKSPACE_NAME } from '@fantasy-map/shared';

describe('web workspace imports', () => {
  it('resolves the shared workspace packages', () => {
    expect(WORKSPACE_NAME).toBe('Fantasy Map Editor');
    expect(MAP_MODEL_SCHEMA_VERSION).toBe(2);
  });
});

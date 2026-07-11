import { describe, expect, it } from 'vitest';

import { createServiceStatus, WORKSPACE_NAME } from './index.js';

describe('createServiceStatus', () => {
  it('creates a stable workspace status', () => {
    expect(createServiceStatus()).toEqual({ name: WORKSPACE_NAME, status: 'ok' });
  });
});

import { describe, expect, it } from 'vitest';

import { AppController } from './app.controller.js';

describe('AppController', () => {
  it('reports that the API is healthy', () => {
    expect(new AppController().getHealth()).toEqual({
      name: 'Fantasy Map Editor',
      status: 'ok',
    });
  });
});

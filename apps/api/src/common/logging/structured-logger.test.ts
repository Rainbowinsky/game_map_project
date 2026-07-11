import { describe, expect, it } from 'vitest';

import { createAppConfigFixture } from '../../test/app-config.fixture.js';
import { redactLogValue, StructuredLogger } from './structured-logger.js';

describe('StructuredLogger', () => {
  it('redacts secret keys, bearer tokens and database URLs', () => {
    expect(
      redactLogValue({
        password: 'hunter2',
        authorization: 'Bearer abc.def.ghi',
        nested: {
          databaseUrl: 'mysql://root:secret@localhost:3306/maps',
        },
        message: 'failed mysql://root:secret@localhost:3306/maps',
      }),
    ).toEqual({
      password: '[REDACTED]',
      authorization: '[REDACTED]',
      nested: { databaseUrl: '[REDACTED]' },
      message: 'failed [REDACTED_DATABASE_URL]',
    });
  });

  it('emits structured JSON without leaking secrets', () => {
    const lines: string[] = [];
    const logger = new StructuredLogger(createAppConfigFixture(), (line) => lines.push(line));

    logger.error('Connection failed.', {
      token: 'secret-token',
      error: new Error('mysql://root:secret@localhost:3306/maps unavailable'),
    });

    expect(lines).toHaveLength(1);
    expect(() => JSON.parse(lines[0] ?? '')).not.toThrow();
    expect(lines[0]).not.toContain('secret-token');
    expect(lines[0]).not.toContain('root:secret');
  });
});

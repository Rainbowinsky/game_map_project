import { describe, expect, it } from 'vitest';

import { ThemeRegistry, themeRegistry } from './ThemeRegistry.js';

describe('ThemeRegistry', () => {
  it('resolves the built-in bright hand-drawn theme', () => {
    const resolved = themeRegistry.resolve('mvp-classic');

    expect(resolved.usedFallback).toBe(false);
    expect(resolved.definition.displayName).toBe('明亮幻想手绘');
    expect(resolved.tokens.grid).toBe('#667A5B');
    expect(themeRegistry.list()).toHaveLength(2);
  });

  it('falls back deterministically for an unknown theme id', () => {
    const resolved = themeRegistry.resolve('deleted-theme');

    expect(resolved.usedFallback).toBe(true);
    expect(resolved.requestedThemeId).toBe('deleted-theme');
    expect(resolved.definition.id).toBe('mvp-classic');
  });

  it('rejects duplicate ids and an unregistered fallback', () => {
    const first = themeRegistry.list()[0]!;
    expect(() => new ThemeRegistry([first, first], first.id)).toThrow('unique');
    expect(() => new ThemeRegistry([first], 'missing')).toThrow('not registered');
  });
});

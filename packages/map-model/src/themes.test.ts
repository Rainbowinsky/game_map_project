import { describe, expect, it } from 'vitest';

import { themeDefinitionSchema } from './themes.js';

const theme = {
  id: 'bright-hand-drawn',
  displayName: 'Bright hand-drawn',
  tokens: {
    ocean: '#17324D',
    land: '#DCE8CF',
    coast: '#6B7D61',
    grid: '#78906C',
    selection: '#FFFFFF',
    road: '#806647',
    river: '#4A88B5',
    regionFill: '#B8CC9A',
    regionStroke: '#516442',
    text: '#263024',
    defaultFontFamily: 'system-ui, sans-serif',
    textureAssetId: null,
    markerIconAssetId: null,
    allowedBlendModes: ['normal', 'multiply'],
  },
};

describe('theme contracts', () => {
  it('accepts a strict built-in theme definition', () => {
    expect(themeDefinitionSchema.parse(theme)).toEqual(theme);
  });

  it('rejects duplicate blend modes and unknown token fields', () => {
    expect(() =>
      themeDefinitionSchema.parse({
        ...theme,
        tokens: { ...theme.tokens, allowedBlendModes: ['normal', 'normal'] },
      }),
    ).toThrow();
    expect(() => themeDefinitionSchema.parse({ ...theme, unsupported: true })).toThrow();
  });
});

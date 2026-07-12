import {
  themeDefinitionSchema,
  type ThemeDefinition,
  type ThemeTokens,
} from '@fantasy-map/map-model';

export interface ResolvedTheme {
  readonly definition: ThemeDefinition;
  readonly tokens: ThemeTokens;
  readonly requestedThemeId: string;
  readonly usedFallback: boolean;
}

/** Resolves the document's visual vocabulary in one place. */
export class ThemeRegistry {
  private readonly themesById: ReadonlyMap<string, ThemeDefinition>;

  constructor(
    themes: readonly ThemeDefinition[],
    private readonly fallbackThemeId: string,
  ) {
    const parsed = themes.map((theme) => themeDefinitionSchema.parse(theme));
    if (parsed.length === 0) throw new Error('ThemeRegistry requires at least one theme.');
    if (new Set(parsed.map((theme) => theme.id)).size !== parsed.length) {
      throw new Error('ThemeRegistry theme ids must be unique.');
    }
    this.themesById = new Map(parsed.map((theme) => [theme.id, theme]));
    if (!this.themesById.has(fallbackThemeId)) {
      throw new Error(`ThemeRegistry fallback theme "${fallbackThemeId}" is not registered.`);
    }
  }

  list(): readonly ThemeDefinition[] {
    return [...this.themesById.values()];
  }

  resolve(requestedThemeId: string): ResolvedTheme {
    const definition = this.themesById.get(requestedThemeId);
    if (definition) {
      return { definition, tokens: definition.tokens, requestedThemeId, usedFallback: false };
    }
    const fallback = this.themesById.get(this.fallbackThemeId);
    if (!fallback) throw new Error('ThemeRegistry fallback theme is unavailable.');
    return {
      definition: fallback,
      tokens: fallback.tokens,
      requestedThemeId,
      usedFallback: true,
    };
  }
}

export const BUILT_IN_THEMES = [
  themeDefinitionSchema.parse({
    id: 'mvp-classic',
    displayName: '明亮幻想手绘',
    tokens: {
      ocean: '#456D8A',
      land: '#E8E2C9',
      coast: '#798861',
      grid: '#667A5B',
      selection: '#F4F0D8',
      road: '#8A6746',
      river: '#4C8BB8',
      regionFill: '#BFD39B',
      regionStroke: '#5A704B',
      text: '#273127',
      defaultFontFamily: "Georgia, 'Noto Serif SC', 'Songti SC', serif",
      textureAssetId: null,
      markerIconAssetId: null,
      allowedBlendModes: ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'],
    },
  }),
  themeDefinitionSchema.parse({
    id: 'mvp-sunlit-atlas',
    displayName: '晴空海图',
    tokens: {
      ocean: '#5C8E9F',
      land: '#F0DFB5',
      coast: '#A1714D',
      grid: '#6F8361',
      selection: '#FFF6CD',
      road: '#9A6945',
      river: '#3E88AF',
      regionFill: '#D8C783',
      regionStroke: '#8A693F',
      text: '#343129',
      defaultFontFamily: "Georgia, 'Noto Serif SC', 'Songti SC', serif",
      textureAssetId: null,
      markerIconAssetId: null,
      allowedBlendModes: ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'],
    },
  }),
] as const satisfies readonly ThemeDefinition[];

export const themeRegistry = new ThemeRegistry(BUILT_IN_THEMES, 'mvp-classic');

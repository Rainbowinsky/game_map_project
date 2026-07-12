import type { Graphics } from 'pixi.js';
import type { MapDocument, ThemeTokens } from '@fantasy-map/map-model';

export function colorToNumber(color: string): number {
  const parsed = Number.parseInt(color.replace('#', ''), 16);
  return Number.isFinite(parsed) ? parsed : 0xc8c5b5;
}

/** Draws the map artwork shared by the editor renderer and PNG exporter. */
export function drawMapArtwork(
  document: MapDocument,
  tokens: ThemeTokens,
  background: Graphics,
  boundary: Graphics,
): void {
  const { width, height } = document;
  const backgroundColor =
    document.background.kind === 'solid'
      ? colorToNumber(document.background.color)
      : colorToNumber(tokens.ocean);
  background.clear();
  boundary.clear();
  background
    .rect(0, 0, width, height)
    .fill({ color: backgroundColor })
    .rect(0, 0, width, height)
    .fill({ color: colorToNumber(tokens.land), alpha: 0.72 })
    .ellipse(width * 0.18, height * 0.22, width * 0.13, height * 0.09)
    .stroke({ color: colorToNumber(tokens.coast), alpha: 0.12, width: 2 })
    .ellipse(width * 0.83, height * 0.75, width * 0.18, height * 0.14)
    .stroke({ color: colorToNumber(tokens.coast), alpha: 0.1, width: 2 });

  boundary
    .rect(0, 0, width, height)
    .stroke({ color: colorToNumber(tokens.land), alpha: 0.55, width: 2 })
    .rect(10, 10, Math.max(0, width - 20), Math.max(0, height - 20))
    .stroke({ color: colorToNumber(tokens.text), alpha: 0.3, width: 1 });
}

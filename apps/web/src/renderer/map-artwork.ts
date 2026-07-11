import { Graphics } from 'pixi.js';
import type { MapDocument } from '@fantasy-map/map-model';

function colorToNumber(color: string): number {
  const parsed = Number.parseInt(color.replace('#', ''), 16);
  return Number.isFinite(parsed) ? parsed : 0xc8c5b5;
}

/** Draws the map artwork shared by the editor renderer and PNG exporter. */
export function drawMapArtwork(
  document: MapDocument,
  background: Graphics,
  boundary: Graphics,
): void {
  const { width, height } = document;
  const backgroundColor =
    document.background.kind === 'solid' ? colorToNumber(document.background.color) : 0xc9c6b6;
  background
    .rect(0, 0, width, height)
    .fill({ color: backgroundColor })
    .rect(0, 0, width, height)
    .fill({ color: 0xe7e1cf, alpha: 0.72 });

  const contour = new Graphics();
  contour
    .ellipse(width * 0.18, height * 0.22, width * 0.13, height * 0.09)
    .stroke({ color: 0x59634f, alpha: 0.12, width: 2 })
    .ellipse(width * 0.83, height * 0.75, width * 0.18, height * 0.14)
    .stroke({ color: 0x59634f, alpha: 0.1, width: 2 });
  background.addChild(contour);

  boundary
    .rect(0, 0, width, height)
    .stroke({ color: 0xe6e4d7, alpha: 0.55, width: 2 })
    .rect(10, 10, Math.max(0, width - 20), Math.max(0, height - 20))
    .stroke({ color: 0x384133, alpha: 0.3, width: 1 });
}

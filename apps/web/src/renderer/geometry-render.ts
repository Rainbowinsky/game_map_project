import { Graphics } from 'pixi.js';
import type {
  MapObject,
  PathMapObject,
  RegionMapObject,
  ThemeTokens,
  WorldPoint,
} from '@fantasy-map/map-model';

import { colorToNumber } from './map-artwork.js';

function absoluteHandle(anchor: WorldPoint, handle?: WorldPoint): WorldPoint {
  return handle ? { x: anchor.x + handle.x, y: anchor.y + handle.y } : anchor;
}

export function drawPath(graphics: Graphics, object: PathMapObject, tokens: ThemeTokens): void {
  graphics.clear();
  const first = object.nodes[0];
  if (!first) return;
  graphics.moveTo(first.anchor.x, first.anchor.y);
  for (let index = 1; index < object.nodes.length; index += 1) {
    const previous = object.nodes[index - 1]!;
    const current = object.nodes[index]!;
    if (previous.handleOut || current.handleIn) {
      const control1 = absoluteHandle(previous.anchor, previous.handleOut);
      const control2 = absoluteHandle(current.anchor, current.handleIn);
      graphics.bezierCurveTo(
        control1.x,
        control1.y,
        control2.x,
        control2.y,
        current.anchor.x,
        current.anchor.y,
      );
    } else {
      graphics.lineTo(current.anchor.x, current.anchor.y);
    }
  }
  graphics.stroke({
    color: colorToNumber(object.pathKind === 'river' ? tokens.river : tokens.road),
    width: Math.max(1, (object.widthStart + object.widthEnd) / 2),
    alpha: object.opacity,
    cap: 'round',
    join: 'round',
  });
}

export function drawRegion(graphics: Graphics, object: RegionMapObject, tokens: ThemeTokens): void {
  graphics.clear();
  const first = object.vertices[0];
  if (!first) return;
  graphics.moveTo(first.x, first.y);
  for (const vertex of object.vertices.slice(1)) graphics.lineTo(vertex.x, vertex.y);
  graphics.closePath();
  graphics.fill({ color: colorToNumber(tokens.regionFill), alpha: object.opacity * 0.48 }).stroke({
    color: colorToNumber(tokens.regionStroke),
    width: object.strokeWidth,
    alpha: object.opacity,
    join: 'round',
  });
}

export function createGeometryGraphics(object: MapObject, tokens: ThemeTokens): Graphics | null {
  if (object.type !== 'path' && object.type !== 'region') return null;
  const graphics = new Graphics();
  graphics.eventMode = 'none';
  graphics.label = `object:${object.id}`;
  graphics.zIndex = object.zIndex;
  graphics.visible = object.visible;
  if (object.type === 'path') drawPath(graphics, object, tokens);
  else drawRegion(graphics, object, tokens);
  return graphics;
}

import { Graphics, Text } from 'pixi.js';
import type {
  MapObject,
  PathMapObject,
  RegionMapObject,
  TerrainStrokeMapObject,
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

function terrainColor(object: TerrainStrokeMapObject, tokens: ThemeTokens): number {
  if (object.brush.color) return colorToNumber(object.brush.color);
  const value =
    object.terrainKind === 'water'
      ? tokens.river
      : object.terrainKind === 'forest'
        ? tokens.regionStroke
        : object.terrainKind === 'mountain'
          ? tokens.coast
          : object.terrainKind === 'desert'
            ? tokens.regionFill
            : tokens.land;
  return colorToNumber(value);
}

/** Soft edge plus a hardness-controlled core; persisted data remains a semantic centerline. */
export function drawTerrainStroke(
  graphics: Graphics,
  object: TerrainStrokeMapObject,
  tokens: ThemeTokens,
): void {
  graphics.clear();
  const first = object.points[0];
  if (!first) return;
  const trace = () => {
    graphics.moveTo(first.x, first.y);
    for (const point of object.points.slice(1)) graphics.lineTo(point.x, point.y);
  };
  const color = terrainColor(object, tokens);
  trace();
  graphics.stroke({
    color,
    width: object.brush.radius * 2,
    alpha:
      object.opacity * object.brush.opacity * Math.max(0.12, 0.34 - object.brush.hardness * 0.18),
    cap: 'round',
    join: 'round',
  });
  trace();
  graphics.stroke({
    color,
    width: Math.max(0.5, object.brush.radius * 2 * (0.35 + object.brush.hardness * 0.65)),
    alpha: object.opacity * object.brush.opacity * (0.42 + object.brush.hardness * 0.48),
    cap: 'round',
    join: 'round',
  });
}

export function createGeometryGraphics(
  object: MapObject,
  tokens: ThemeTokens,
): Graphics | Text | null {
  if (object.type === 'text') {
    const text = new Text({
      text: object.text,
      anchor: { x: object.align === 'left' ? 0 : object.align === 'right' ? 1 : 0.5, y: 0.5 },
      style: {
        fontFamily: tokens.defaultFontFamily,
        fontSize: object.fontSize,
        fill: tokens.text,
        align: object.align,
      },
    });
    text.position.set(object.x, object.y);
    text.rotation = object.rotation;
    text.scale.set(object.scaleX, object.scaleY);
    text.alpha = object.opacity;
    text.zIndex = object.zIndex;
    return text;
  }
  if (object.type === 'marker') {
    const graphics = new Graphics();
    const radius = 14;
    graphics
      .circle(object.x, object.y - radius * 0.45, radius)
      .fill({ color: colorToNumber(tokens.coast), alpha: object.opacity })
      .stroke({ color: colorToNumber(tokens.text), width: 2 })
      .moveTo(object.x - 7, object.y + 5)
      .lineTo(object.x, object.y + 18)
      .lineTo(object.x + 7, object.y + 5)
      .closePath()
      .fill({ color: colorToNumber(tokens.coast), alpha: object.opacity });
    graphics.zIndex = object.zIndex;
    graphics.visible = object.visible;
    return graphics;
  }
  if (object.type !== 'path' && object.type !== 'region' && object.type !== 'terrain-stroke')
    return null;
  const graphics = new Graphics();
  graphics.eventMode = 'none';
  graphics.label = `object:${object.id}`;
  graphics.zIndex = object.zIndex;
  graphics.visible = object.visible;
  if (object.type === 'path') drawPath(graphics, object, tokens);
  else if (object.type === 'region') drawRegion(graphics, object, tokens);
  else drawTerrainStroke(graphics, object, tokens);
  return graphics;
}

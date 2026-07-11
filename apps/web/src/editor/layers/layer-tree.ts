import type { MapLayer } from '@fantasy-map/map-model';

export interface LayerTreeItem {
  readonly layer: MapLayer;
  readonly depth: number;
}

export function flattenLayerTree(layers: readonly MapLayer[]): LayerTreeItem[] {
  const children = new Map<string | null, MapLayer[]>();
  for (const layer of layers) {
    const siblings = children.get(layer.parentId) ?? [];
    siblings.push(layer);
    children.set(layer.parentId, siblings);
  }
  for (const siblings of children.values()) siblings.sort((a, b) => b.order - a.order);

  const result: LayerTreeItem[] = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const layer of children.get(parentId) ?? []) {
      result.push({ layer, depth });
      if (layer.type === 'group') visit(layer.id, depth + 1);
    }
  };
  visit(null, 0);
  return result;
}

export function isLayerEffectivelyEditable(
  layerId: string,
  layersById: Readonly<Record<string, MapLayer>>,
): boolean {
  const visited = new Set<string>();
  let layer = layersById[layerId];
  while (layer) {
    if (visited.has(layer.id) || !layer.visible || layer.locked) return false;
    visited.add(layer.id);
    layer = layer.parentId === null ? undefined : layersById[layer.parentId];
  }
  return visited.size > 0;
}

export function siblingIds(layers: readonly MapLayer[], parentId: string | null): string[] {
  return layers
    .filter((layer) => layer.parentId === parentId)
    .sort((a, b) => a.order - b.order)
    .map((layer) => layer.id);
}

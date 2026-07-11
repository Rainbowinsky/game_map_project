import type {
  MapDocument,
  MapLayer,
  MapObject,
  MapOperation,
  ObjectChanges,
} from '@fantasy-map/map-model';

/**
 * A normalized domain change. The store consumes the domain data while the
 * optional operation is sent to persistence by the operation journal.
 */
export type DomainPatch =
  | {
      readonly type: 'object.create';
      readonly object: MapObject;
      readonly operation: MapOperation;
    }
  | {
      readonly type: 'object.replace';
      readonly object: MapObject;
      readonly operation: MapOperation | null;
    }
  | {
      readonly type: 'object.delete';
      readonly objectId: string;
      readonly operation: MapOperation | null;
    }
  | {
      readonly type: 'layer.create';
      readonly layer: MapLayer;
      readonly operation: MapOperation;
    }
  | {
      readonly type: 'layer.replace';
      readonly layer: MapLayer;
      readonly operation: MapOperation;
    }
  | {
      readonly type: 'layer.delete';
      readonly layerId: string;
      readonly operation: MapOperation;
    }
  | {
      readonly type: 'layer.reorder';
      readonly parentId: string | null;
      readonly orderedLayerIds: readonly string[];
      readonly operation: MapOperation;
    }
  | {
      readonly type: 'document.replace';
      readonly document: MapDocument;
      readonly operation: MapOperation;
    };

export interface CommandContext {
  getDocument(): MapDocument;
  getLayer(layerId: string): MapLayer | undefined;
  getObject(objectId: string): MapObject | undefined;
  getObjectsInLayer(layerId: string): readonly MapObject[];
  applyPatches(patches: readonly DomainPatch[]): void;
}

export interface CommandExecution {
  readonly patches: readonly DomainPatch[];
}

export interface EditorCommand {
  readonly id: string;
  readonly label: string;
  execute(context: CommandContext): CommandExecution;
  undo(context: CommandContext): CommandExecution;
  redo(context: CommandContext): CommandExecution;
  estimateBytes(): number;
  mergeWith?(next: EditorCommand): EditorCommand | undefined;
}

export type TransformChanges = Pick<ObjectChanges, 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY'>;

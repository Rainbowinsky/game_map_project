import type { CommandContext, EditorCommand } from './domain-patch.js';
import { PatchBus, type PatchSource } from './patch-bus.js';

export const DEFAULT_HISTORY_ENTRY_LIMIT = 200;
export const DEFAULT_HISTORY_BYTE_LIMIT = 32 * 1024 * 1024;

export interface CommandManagerOptions {
  readonly maxEntries?: number;
  readonly maxBytes?: number;
  readonly patchBus?: PatchBus;
}

export interface CommandHistorySnapshot {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoDepth: number;
  readonly redoDepth: number;
  readonly estimatedBytes: number;
}

interface HistoryEntry {
  readonly command: EditorCommand;
  readonly bytes: number;
}

export class CommandTransaction {
  private readonly commands: EditorCommand[] = [];
  private closed = false;

  constructor(
    private readonly manager: CommandManager,
    readonly label: string,
  ) {}

  add(command: EditorCommand): void {
    if (this.closed) throw new Error('This command transaction is already closed.');
    this.commands.push(command);
  }

  commit(): boolean {
    if (this.closed) throw new Error('This command transaction is already closed.');
    this.closed = true;
    return this.manager.executeTransaction(this.label, this.commands);
  }

  cancel(): void {
    if (this.closed) throw new Error('This command transaction is already closed.');
    this.closed = true;
  }
}

/**
 * Framework-agnostic, Pixi-free history manager. It owns only command history;
 * the passed context remains the source of truth for the current document.
 */
export class CommandManager {
  readonly patches: PatchBus;

  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly undoStack: HistoryEntry[] = [];
  private readonly redoStack: HistoryEntry[] = [];
  private readonly listeners = new Set<() => void>();
  private snapshot: CommandHistorySnapshot = {
    canUndo: false,
    canRedo: false,
    undoDepth: 0,
    redoDepth: 0,
    estimatedBytes: 0,
  };

  constructor(
    private readonly context: CommandContext,
    options: CommandManagerOptions = {},
  ) {
    this.maxEntries = options.maxEntries ?? DEFAULT_HISTORY_ENTRY_LIMIT;
    this.maxBytes = options.maxBytes ?? DEFAULT_HISTORY_BYTE_LIMIT;
    if (!Number.isSafeInteger(this.maxEntries) || this.maxEntries < 1) {
      throw new RangeError('maxEntries must be a positive safe integer.');
    }
    if (!Number.isSafeInteger(this.maxBytes) || this.maxBytes < 1) {
      throw new RangeError('maxBytes must be a positive safe integer.');
    }
    this.patches = options.patchBus ?? new PatchBus();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): CommandHistorySnapshot => this.snapshot;

  beginTransaction(label: string): CommandTransaction {
    return new CommandTransaction(this, label);
  }

  execute(command: EditorCommand): boolean {
    const result = command.execute(this.context);
    if (result.patches.length === 0) return false;

    this.context.applyPatches(result.patches);
    this.record(command);
    this.publish('execute', result.patches);
    return true;
  }

  undo(): boolean {
    const entry = this.undoStack.at(-1);
    if (!entry) return false;

    const result = entry.command.undo(this.context);
    this.context.applyPatches(result.patches);
    this.undoStack.pop();
    this.redoStack.push(entry);
    this.publish('undo', result.patches);
    return true;
  }

  redo(): boolean {
    const entry = this.redoStack.at(-1);
    if (!entry) return false;

    const result = entry.command.redo(this.context);
    this.context.applyPatches(result.patches);
    this.redoStack.pop();
    this.undoStack.push(entry);
    this.publish('redo', result.patches);
    return true;
  }

  clear(): void {
    if (this.undoStack.length === 0 && this.redoStack.length === 0) return;
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.notify();
  }

  executeTransaction(label: string, commands: readonly EditorCommand[]): boolean {
    if (commands.length === 0) return false;

    const executed: EditorCommand[] = [];
    const patches = [] as ReturnType<EditorCommand['execute']>['patches'][number][];

    try {
      for (const command of commands) {
        const result = command.execute(this.context);
        if (result.patches.length === 0) continue;
        this.context.applyPatches(result.patches);
        executed.push(command);
        patches.push(...result.patches);
      }
    } catch (error) {
      const rollback = executed.reverse().flatMap((command) => command.undo(this.context).patches);
      if (rollback.length > 0) this.context.applyPatches(rollback);
      throw error;
    }

    if (executed.length === 0) return false;
    this.record(new CompositeCommand(label, executed));
    this.publish('execute', patches);
    return true;
  }

  private record(command: EditorCommand): void {
    this.redoStack.length = 0;
    const previous = this.undoStack.at(-1);
    const merged = previous?.command.mergeWith?.(command);

    if (merged && previous) {
      this.undoStack[this.undoStack.length - 1] = {
        command: merged,
        bytes: merged.estimateBytes(),
      };
    } else {
      this.undoStack.push({ command, bytes: command.estimateBytes() });
    }

    this.trimHistory();
  }

  private trimHistory(): void {
    while (
      this.undoStack.length > this.maxEntries ||
      (this.undoStack.length > 0 && this.totalBytes() > this.maxBytes)
    ) {
      this.undoStack.shift();
    }
  }

  private totalBytes(): number {
    return [...this.undoStack, ...this.redoStack].reduce((total, entry) => total + entry.bytes, 0);
  }

  private publish(source: PatchSource, patches: Parameters<PatchBus['publish']>[1]): void {
    this.patches.publish(source, patches);
    this.notify();
  }

  private notify(): void {
    this.snapshot = {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      undoDepth: this.undoStack.length,
      redoDepth: this.redoStack.length,
      estimatedBytes: this.totalBytes(),
    };
    for (const listener of this.listeners) listener();
  }
}

class CompositeCommand implements EditorCommand {
  readonly id = 'transaction';

  constructor(
    readonly label: string,
    private readonly commands: readonly EditorCommand[],
  ) {}

  execute(): never {
    throw new Error('A committed composite command cannot execute again. Use redo instead.');
  }

  undo(context: CommandContext) {
    return {
      patches: this.commands
        .slice()
        .reverse()
        .flatMap((command) => command.undo(context).patches),
    };
  }

  redo(context: CommandContext) {
    return { patches: this.commands.flatMap((command) => command.redo(context).patches) };
  }

  estimateBytes(): number {
    return this.commands.reduce((total, command) => total + command.estimateBytes(), 0);
  }
}

import type { CommandManager } from './CommandManager.js';

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined') return false;
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/** Handles the document-history shortcuts without stealing native text undo. */
export function handleHistoryShortcut(event: KeyboardEvent, manager: CommandManager): boolean {
  if (event.isComposing || isTextEntryTarget(event.target)) return false;
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== 'z')
    return false;

  const handled = event.shiftKey ? manager.redo() : manager.undo();
  if (handled) event.preventDefault();
  return handled;
}

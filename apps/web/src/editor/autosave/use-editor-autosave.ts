import { useCallback, useEffect, useRef, useState } from 'react';
import { MAP_MODEL_SCHEMA_VERSION, type MapDocument } from '@fantasy-map/map-model';
import type { AuthResponse } from '@fantasy-map/validation';

import { api } from '../../services/api-client.js';
import { loadMapIntoStore } from '../../services/map-loader.js';
import { useEditorStore } from '../../stores/editor-store.js';
import { useMapStore } from '../../stores/map-store.js';
import type { CommandManager } from '../commands/CommandManager.js';
import { connectOperationJournal } from '../commands/operation-journal.js';
import { AutosaveCoordinator, type AutosaveSnapshot } from './AutosaveCoordinator.js';
import { DurableOperationJournal } from './DurableOperationJournal.js';
import { MapEditChannel } from './map-edit-channel.js';
import {
  IndexedDbRecoveryPersistence,
  flattenPersistedOperations,
  loadRecovery,
  recoveryKey,
  type PersistedJournal,
} from './recovery-store.js';
import { replayRecoveryOperations } from './replay-recovery.js';

export interface RecoveryPrompt {
  readonly kind: 'recoverable' | 'blocked';
  readonly message: string;
  readonly operationCount: number;
}

interface AutosaveRuntime {
  readonly journal: DurableOperationJournal;
  readonly coordinator: AutosaveCoordinator;
  readonly disconnectJournal: () => void;
  readonly unsubscribeCoordinator: () => void;
  readonly channel: MapEditChannel;
  readonly onOnline: () => void;
  readonly onOffline: () => void;
}

interface UseEditorAutosaveInput {
  readonly document: MapDocument | null;
  readonly session: AuthResponse | null;
  readonly commandManager: CommandManager;
}

const statusNeedsProtection = new Set(['dirty', 'saving', 'offline', 'error', 'conflict']);

export function useEditorAutosave({ document, session, commandManager }: UseEditorAutosaveInput) {
  const ownerId = session?.user.id ?? null;
  const accessToken = session?.accessToken ?? null;
  const documentId = document?.id ?? null;
  const persistenceRef = useRef(new IndexedDbRecoveryPersistence());
  const runtimeRef = useRef<AutosaveRuntime | null>(null);
  const recoveredRef = useRef<PersistedJournal | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [recoveryPrompt, setRecoveryPrompt] = useState<RecoveryPrompt | null>(null);
  const [multiTabWarning, setMultiTabWarning] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [snapshot, setSnapshot] = useState<AutosaveSnapshot>({
    status: 'saved',
    revision: document?.revision ?? 0,
    pendingOperations: 0,
    errorMessage: null,
  });

  const stopRuntime = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.coordinator.stop();
    runtime.disconnectJournal();
    runtime.unsubscribeCoordinator();
    runtime.channel.close();
    window.removeEventListener('online', runtime.onOnline);
    window.removeEventListener('offline', runtime.onOffline);
    runtimeRef.current = null;
  }, []);

  const startRuntime = useCallback(
    (record?: PersistedJournal) => {
      stopRuntime();
      if (!ownerId || !accessToken) return;
      const current = useMapStore.getState().document;
      if (!current) return;
      const journal = new DurableOperationJournal(
        persistenceRef.current,
        {
          ownerId,
          mapId: current.id,
          baseRevision: record?.baseRevision ?? current.revision,
        },
        record,
      );
      const channel = new MapEditChannel(ownerId, current.id, (message) => {
        setMultiTabWarning(
          message.type === 'dirty'
            ? '另一个标签页正在编辑这张地图，保存时可能产生版本冲突。'
            : '检测到同一张地图已在另一个标签页打开。',
        );
      });
      const coordinator = new AutosaveCoordinator(journal, {
        save: (input) =>
          api.applyOperations(accessToken, current.id, {
            schemaVersion: MAP_MODEL_SCHEMA_VERSION,
            baseRevision: input.baseRevision,
            clientMutationId: input.clientMutationId,
            operations: [...input.operations],
          }),
        onRevision: (revision, updatedAt) => {
          useMapStore.getState().confirmRevision(revision, updatedAt);
          channel.post('saved', revision);
        },
      });
      const unsubscribeCoordinator = coordinator.subscribe((next) => {
        setSnapshot(next);
        useEditorStore.getState().setSaveStatus(next.status);
        if (next.status === 'dirty') channel.post('dirty', next.revision);
      });
      const disconnectJournal = connectOperationJournal(commandManager.patches, journal);
      const onOnline = () => coordinator.setOnline(true);
      const onOffline = () => coordinator.setOnline(false);
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
      runtimeRef.current = {
        journal,
        coordinator,
        disconnectJournal,
        unsubscribeCoordinator,
        channel,
        onOnline,
        onOffline,
      };
      channel.post('open', current.revision);
      coordinator.start();
    },
    [accessToken, commandManager.patches, ownerId, stopRuntime],
  );

  useEffect(() => {
    let cancelled = false;
    stopRuntime();
    recoveredRef.current = null;
    setInitializing(true);
    setRecoveryPrompt(null);
    setMultiTabWarning(null);
    useEditorStore.getState().setSaveStatus('saved');
    if (!documentId || !ownerId || !accessToken) {
      setInitializing(false);
      return () => {
        cancelled = true;
      };
    }

    const initialize = async () => {
      const loaded = await loadRecovery(persistenceRef.current, ownerId, documentId);
      if (cancelled) return;
      if (loaded.kind === 'invalid') {
        setRecoveryPrompt({ kind: 'blocked', message: loaded.reason, operationCount: 0 });
        setInitializing(false);
        return;
      }
      if (loaded.kind === 'none') {
        startRuntime();
        setInitializing(false);
        return;
      }

      let record = loaded.record;
      const loadedRevision = useMapStore.getState().document?.revision ?? 0;
      if (record.activeBatch && record.baseRevision !== loadedRevision) {
        try {
          const response = await api.applyOperations(accessToken, documentId, {
            schemaVersion: MAP_MODEL_SCHEMA_VERSION,
            baseRevision: record.activeBatch.baseRevision,
            clientMutationId: record.activeBatch.mutationId,
            operations: record.activeBatch.operations,
          });
          const journal = new DurableOperationJournal(
            persistenceRef.current,
            {
              ownerId,
              mapId: documentId,
              baseRevision: record.baseRevision,
            },
            record,
          );
          await journal.acknowledge(record.activeBatch.throughSequence, response.revision);
          await loadMapIntoStore(accessToken, documentId);
          record = journal.getPersistedRecord();
          if (record.entries.length === 0) {
            startRuntime();
            setInitializing(false);
            return;
          }
        } catch {
          setRecoveryPrompt({
            kind: 'blocked',
            message: '无法确认崩溃前的保存结果。请恢复网络后重试，或丢弃本机日志并重新加载。',
            operationCount: record.entries.reduce(
              (total, entry) => total + entry.operations.length,
              0,
            ),
          });
          recoveredRef.current = record;
          setInitializing(false);
          return;
        }
      }

      const currentRevision = useMapStore.getState().document?.revision ?? loadedRevision;
      const operationCount = record.entries.reduce(
        (total, entry) => total + entry.operations.length,
        0,
      );
      recoveredRef.current = record;
      if (record.baseRevision !== currentRevision) {
        setRecoveryPrompt({
          kind: 'blocked',
          message: `本机日志基于 R${record.baseRevision}，服务端已是 R${currentRevision}，不能自动覆盖。`,
          operationCount,
        });
      } else {
        setRecoveryPrompt({
          kind: 'recoverable',
          message: `发现 ${operationCount} 项尚未提交的本机更改。`,
          operationCount,
        });
      }
      setInitializing(false);
    };

    void initialize().catch(() => {
      if (cancelled) return;
      setRecoveryPrompt({
        kind: 'blocked',
        message: '读取本机恢复日志失败。可重试或丢弃该地图的本机日志。',
        operationCount: 0,
      });
      setInitializing(false);
    });
    return () => {
      cancelled = true;
      stopRuntime();
    };
  }, [accessToken, documentId, generation, ownerId, startRuntime, stopRuntime]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!statusNeedsProtection.has(snapshot.status) || snapshot.pendingOperations === 0) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [snapshot.pendingOperations, snapshot.status]);

  const recover = useCallback(() => {
    const record = recoveredRef.current;
    if (!record || recoveryPrompt?.kind !== 'recoverable') return;
    try {
      replayRecoveryOperations(commandManager, flattenPersistedOperations(record));
      setRecoveryPrompt(null);
      recoveredRef.current = null;
      startRuntime(record);
    } catch (error) {
      setRecoveryPrompt({
        kind: 'blocked',
        message: error instanceof Error ? error.message : '恢复日志无法安全应用。',
        operationCount: recoveryPrompt.operationCount,
      });
    }
  }, [commandManager, recoveryPrompt, startRuntime]);

  const discard = useCallback(async () => {
    if (!ownerId || !documentId) return;
    await persistenceRef.current.delete(recoveryKey(ownerId, documentId));
    recoveredRef.current = null;
    setRecoveryPrompt(null);
    startRuntime();
  }, [documentId, ownerId, startRuntime]);

  const retryRecovery = useCallback(() => setGeneration((value) => value + 1), []);
  const retrySave = useCallback(() => runtimeRef.current?.coordinator.retryNow(), []);
  const hasUnsavedChanges =
    snapshot.pendingOperations > 0 && statusNeedsProtection.has(snapshot.status);
  const confirmNavigation = useCallback(() => {
    return !hasUnsavedChanges || window.confirm('仍有未保存的地图更改，确定离开编辑器吗？');
  }, [hasUnsavedChanges]);

  return {
    snapshot,
    initializing,
    recoveryPrompt,
    multiTabWarning,
    recover,
    discard,
    retryRecovery,
    retrySave,
    confirmNavigation,
  };
}

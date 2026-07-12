import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { AppError } from '../common/errors/app-error.js';
import {
  LocalStorageProvider,
  resolveStoragePath,
  validateStorageKey,
} from './local-storage.provider.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('LocalStorageProvider', () => {
  it('writes, reads, describes and deletes a logical key', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fantasy-map-storage-'));
    temporaryRoots.push(root);
    const provider = new LocalStorageProvider(root);
    const content = new TextEncoder().encode('mountain');

    await expect(provider.put('stamps/mountain.svg', content)).resolves.toEqual({
      key: 'stamps/mountain.svg',
      url: '/storage/stamps/mountain.svg',
      byteSize: content.byteLength,
    });
    await expect(provider.exists('stamps/mountain.svg')).resolves.toBe(true);
    await expect(provider.read('stamps/mountain.svg')).resolves.toEqual(content);
    await provider.delete('stamps/mountain.svg');
    await expect(provider.exists('stamps/mountain.svg')).resolves.toBe(false);
  });

  it.each([
    '../secret.txt',
    'stamps/../../secret.txt',
    'C:/Windows/system.ini',
    '/etc/passwd',
    'stamps\\mountain.svg',
    'stamps//mountain.svg',
    'stamps/./mountain.svg',
  ])('rejects traversal or absolute key %s', (key) => {
    expect(() => validateStorageKey(key)).toThrow(AppError);
    expect(() => resolveStoragePath('storage', key)).toThrow(AppError);
  });

  it('never returns an absolute storage path to callers', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fantasy-map-storage-'));
    temporaryRoots.push(root);
    const descriptor = await new LocalStorageProvider(root).put(
      'previews/map.png',
      new Uint8Array([1, 2, 3]),
    );

    expect(JSON.stringify(descriptor)).not.toContain(root);
  });

  it('moves content between validated keys', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fantasy-map-storage-'));
    const provider = new LocalStorageProvider(root);
    await provider.put('temporary/upload.bin', Uint8Array.from([1, 2, 3]));

    const descriptor = await provider.move('temporary/upload.bin', 'assets/user/asset.bin');

    expect(descriptor.url).toBe('/storage/assets/user/asset.bin');
    expect(await provider.exists('temporary/upload.bin')).toBe(false);
    expect(await provider.read('assets/user/asset.bin')).toEqual(Uint8Array.from([1, 2, 3]));
  });
});

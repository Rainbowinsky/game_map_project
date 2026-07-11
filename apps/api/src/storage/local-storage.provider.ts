import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import { AppError } from '../common/errors/app-error.js';
import type { StorageDescriptor, StorageProvider } from './storage-provider.js';

const storageSegmentPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const maximumStorageKeyLength = 500;

export function validateStorageKey(key: string): readonly string[] {
  if (!key || key.length > maximumStorageKeyLength || key.includes('\\') || key.includes('\0')) {
    throw new AppError('INVALID_STORAGE_KEY', 'Storage key is invalid.', 400);
  }

  if (isAbsolute(key) || /^[A-Za-z]:/.test(key)) {
    throw new AppError('INVALID_STORAGE_KEY', 'Storage key must be relative.', 400);
  }

  const segments = key.split('/');

  if (
    segments.some(
      (segment) =>
        segment === '' ||
        segment === '.' ||
        segment === '..' ||
        !storageSegmentPattern.test(segment),
    )
  ) {
    throw new AppError('INVALID_STORAGE_KEY', 'Storage key contains an invalid segment.', 400);
  }

  return segments;
}

export function resolveStoragePath(root: string, key: string): string {
  const absoluteRoot = resolve(root);
  const segments = validateStorageKey(key);
  const candidate = resolve(absoluteRoot, ...segments);
  const relativePath = relative(absoluteRoot, candidate);

  if (relativePath.startsWith(`..${sep}`) || relativePath === '..' || isAbsolute(relativePath)) {
    throw new AppError('INVALID_STORAGE_KEY', 'Storage key escapes the storage root.', 400);
  }

  return candidate;
}

export class LocalStorageProvider implements StorageProvider {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async put(key: string, content: Uint8Array): Promise<StorageDescriptor> {
    const path = resolveStoragePath(this.root, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
    return this.getPublicDescriptor(key);
  }

  async read(key: string): Promise<Uint8Array> {
    return Uint8Array.from(await readFile(resolveStoragePath(this.root, key)));
  }

  async delete(key: string): Promise<void> {
    await rm(resolveStoragePath(this.root, key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      const file = await stat(resolveStoragePath(this.root, key));
      return file.isFile();
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  async getPublicDescriptor(key: string): Promise<StorageDescriptor> {
    const path = resolveStoragePath(this.root, key);
    const file = await stat(path);
    const encodedKey = validateStorageKey(key).map(encodeURIComponent).join('/');

    return {
      key,
      url: `/storage/${encodedKey}`,
      byteSize: file.size,
    };
  }
}

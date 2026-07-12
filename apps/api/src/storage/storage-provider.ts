export interface StorageDescriptor {
  readonly key: string;
  readonly url: string;
  readonly byteSize: number;
}

export interface StorageProvider {
  put(key: string, content: Uint8Array): Promise<StorageDescriptor>;
  move(sourceKey: string, destinationKey: string): Promise<StorageDescriptor>;
  read(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getPublicDescriptor(key: string): Promise<StorageDescriptor>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

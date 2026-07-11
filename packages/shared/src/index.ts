export const WORKSPACE_NAME = 'Fantasy Map Editor' as const;

export type Brand<Value, Name extends string> = Value & {
  readonly __brand: Name;
};

export interface ServiceStatus {
  readonly name: typeof WORKSPACE_NAME;
  readonly status: 'ok';
}

export function createServiceStatus(): ServiceStatus {
  return {
    name: WORKSPACE_NAME,
    status: 'ok',
  };
}

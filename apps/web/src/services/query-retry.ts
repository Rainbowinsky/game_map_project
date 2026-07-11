export function retryApiQuery(failureCount: number, error: unknown): boolean {
  const status =
    typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined;
  return status !== 401 && failureCount < 1;
}

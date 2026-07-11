export type SafeErrorDetails = Readonly<Record<string, unknown>>;

export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details: SafeErrorDetails | undefined;

  constructor(code: string, message: string, statusCode: number, details?: SafeErrorDetails) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class DatabaseUnavailableError extends AppError {
  constructor() {
    super(
      'DATABASE_UNAVAILABLE',
      'The database is unavailable. Check the server and DATABASE_URL configuration.',
      503,
    );
    this.name = 'DatabaseUnavailableError';
  }
}

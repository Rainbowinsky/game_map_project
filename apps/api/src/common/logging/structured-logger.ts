import { Inject, Injectable, Optional, type LoggerService } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../../config/app-config.js';

type LogLevel = AppConfig['logLevel'];
type LogSink = (line: string) => void;
export const STRUCTURED_LOG_SINK = Symbol('STRUCTURED_LOG_SINK');

const levelPriority: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const sensitiveKeyPattern = /password|authorization|cookie|token|secret|database_?url/i;
const databaseUrlPattern = /mysql:\/\/[^\s"']+/gi;
const bearerTokenPattern = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;

function redactString(value: string): string {
  return value
    .replace(databaseUrlPattern, '[REDACTED_DATABASE_URL]')
    .replace(bearerTokenPattern, 'Bearer [REDACTED]');
}

export function redactLogValue(value: unknown, key?: string): unknown {
  if (key && sensitiveKeyPattern.test(key)) {
    return '[REDACTED]';
  }

  if (typeof value === 'string') {
    return redactString(value);
  }

  if (typeof value === 'bigint') {
    return value.toString(10);
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactLogValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactLogValue(entryValue, entryKey),
      ]),
    );
  }

  return value;
}

@Injectable()
export class StructuredLogger implements LoggerService {
  private readonly minimumLevel: LogLevel;
  private readonly sink: LogSink;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    @Optional() @Inject(STRUCTURED_LOG_SINK) sink?: LogSink,
  ) {
    this.minimumLevel = config.logLevel;
    this.sink = sink ?? ((line) => process.stdout.write(`${line}\n`));
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('debug', message, optionalParams);
  }

  private emit(level: LogLevel, message: unknown, optionalParams: unknown[]): void {
    if (levelPriority[level] < levelPriority[this.minimumLevel]) {
      return;
    }

    this.sink(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        message: redactLogValue(message),
        ...(optionalParams.length > 0 ? { context: redactLogValue(optionalParams) } : {}),
      }),
    );
  }
}

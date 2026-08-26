/**
 * Logger minimale: console leggibile + file su disco con rotazione a dimensione.
 * Volutamente senza dipendenze (pino/winston) per mantenere l'app self-contained.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config, LOG_LEVELS, type LogLevel } from '../config.ts';

const MAX_LOG_BYTES = 5 * 1024 * 1024;
const ROTATED_KEEP = 3;

const severity: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = severity[config.logLevel];

const colors: Record<LogLevel, string> = {
  debug: '\u001b[90m',
  info: '\u001b[36m',
  warn: '\u001b[33m',
  error: '\u001b[31m',
};
const RESET = '\u001b[0m';

let stream: fs.WriteStream | null = null;
let logFile = '';

function openStream(): fs.WriteStream | null {
  if (config.isTest) return null;
  if (stream) return stream;
  try {
    fs.mkdirSync(config.logsDir, { recursive: true });
    logFile = path.join(config.logsDir, 'app.log');
    rotateIfNeeded();
    stream = fs.createWriteStream(logFile, { flags: 'a' });
    // Il logging non deve mai far cadere l'applicazione.
    stream.on('error', () => {
      stream = null;
    });
    return stream;
  } catch {
    return null;
  }
}

function rotateIfNeeded(): void {
  if (!logFile) return;
  try {
    if (!fs.existsSync(logFile)) return;
    const { size } = fs.statSync(logFile);
    if (size < MAX_LOG_BYTES) return;
    stream?.end();
    stream = null;
    for (let i = ROTATED_KEEP - 1; i >= 1; i--) {
      const from = `${logFile}.${i}`;
      if (fs.existsSync(from)) fs.renameSync(from, `${logFile}.${i + 1}`);
    }
    fs.renameSync(logFile, `${logFile}.1`);
  } catch {
    /* la rotazione fallita non e' un errore bloccante */
  }
}

function serialize(value: unknown): unknown {
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  return value;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(serialize(value)) ?? String(value);
  } catch {
    return String(value);
  }
}

function write(level: LogLevel, scope: string, message: string, extra?: unknown): void {
  if (severity[level] < threshold) return;
  const ts = new Date().toISOString();
  const detail =
    extra === undefined ? '' : ' ' + (extra instanceof Error ? (extra.stack ?? extra.message) : safeJson(extra));

  const out = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  out.write(`${colors[level]}${ts} ${level.toUpperCase().padEnd(5)}${RESET} [${scope}] ${message}${detail}\n`);

  const target = openStream();
  target?.write(
    JSON.stringify({
      ts,
      level,
      scope,
      message,
      ...(extra === undefined ? {} : { extra: serialize(extra) }),
    }) + '\n',
  );
}

export type Logger = {
  [K in LogLevel]: (message: string, extra?: unknown) => void;
} & { child: (scope: string) => Logger };

export function createLogger(scope: string): Logger {
  const base = {} as Logger;
  for (const level of LOG_LEVELS) {
    base[level] = (message: string, extra?: unknown) => write(level, scope, message, extra);
  }
  base.child = (sub: string) => createLogger(`${scope}:${sub}`);
  return base;
}

export const logger = createLogger('app');

/** Chiude lo stream di log (usato allo shutdown per non perdere righe). */
export function closeLogger(): void {
  stream?.end();
  stream = null;
}

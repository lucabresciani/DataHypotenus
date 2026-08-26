/**
 * Configurazione centralizzata dell'applicazione.
 *
 * Regola: nessun percorso e nessun parametro operativo deve essere scritto
 * altrove nel codice. Tutto passa da qui, e tutto e' sovrascrivibile via
 * variabili d'ambiente (file `.env` nella radice del progetto oppure env reale).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Radice del repository (server/src/config.ts -> ../../). */
export const PROJECT_ROOT = path.resolve(here, '..', '..');

// Carica .env se presente (API nativa di Node, nessuna dipendenza esterna).
const envFile = path.join(PROJECT_ROOT, '.env');
if (fs.existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile);
  } catch {
    // Un .env malformato non deve impedire l'avvio: si usano i default.
    process.stderr.write('[config] .env non leggibile, uso i valori di default\n');
  }
}

const str = (key: string, fallback: string): string => {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
};

const int = (key: string, fallback: number): number => {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const rawLogLevel = str('DH_LOG_LEVEL', 'info');
const logLevel: LogLevel = (LOG_LEVELS as readonly string[]).includes(rawLogLevel)
  ? (rawLogLevel as LogLevel)
  : 'info';

/**
 * DATA_DIR contiene TUTTO cio' che e' persistente: database, allegati, backup,
 * log. Spostare l'applicazione su un'altra macchina = copiare questa cartella.
 */
const dataDir = path.resolve(PROJECT_ROOT, str('DH_DATA_DIR', './data'));

export type AppConfig = {
  readonly projectRoot: string;
  readonly dataDir: string;
  readonly dbPath: string;
  readonly attachmentsDir: string;
  readonly backupsDir: string;
  readonly logsDir: string;
  readonly tmpDir: string;
  readonly webDistDir: string;
  readonly host: string;
  readonly port: number;
  readonly corsOrigins: string[];
  readonly logLevel: LogLevel;
  readonly maxUploadBytes: number;
  readonly autoBackupHours: number;
  readonly backupKeep: number;
  readonly isTest: boolean;
};

export const config: AppConfig = {
  projectRoot: PROJECT_ROOT,
  dataDir,
  dbPath: path.join(dataDir, 'datahypotenus.db'),
  attachmentsDir: path.join(dataDir, 'attachments'),
  backupsDir: path.join(dataDir, 'backups'),
  logsDir: path.join(dataDir, 'logs'),
  tmpDir: path.join(dataDir, 'tmp'),
  webDistDir: path.join(PROJECT_ROOT, 'web', 'dist'),
  host: str('DH_HOST', '127.0.0.1'),
  port: int('DH_PORT', 8787),
  corsOrigins: str('DH_CORS_ORIGINS', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  logLevel,
  maxUploadBytes: int('DH_MAX_UPLOAD_MB', 50) * 1024 * 1024,
  autoBackupHours: int('DH_AUTO_BACKUP_HOURS', 24),
  backupKeep: int('DH_BACKUP_KEEP', 10),
  isTest: process.env.NODE_ENV === 'test' || process.env.VITEST === 'true',
};

/** Crea l'albero di directory dei dati se non esiste. Idempotente. */
export function ensureDataDirs(cfg: AppConfig = config): void {
  for (const dir of [cfg.dataDir, cfg.attachmentsDir, cfg.backupsDir, cfg.logsDir, cfg.tmpDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

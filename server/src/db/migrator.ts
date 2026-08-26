/**
 * Runner di migrazioni.
 *
 * Decisione -> Motivazione -> Alternative
 * Migrazioni = file `NNNN_nome.sql` applicati in ordine, una sola volta,
 * dentro una transazione, con il numero registrato in `schema_migrations`.
 * Nessuna dipendenza (knex/drizzle/prisma): lo schema resta leggibile e
 * applicabile anche a mano con la CLI `sqlite3`, il che e' esattamente la
 * garanzia anti-lock-in richiesta. Alternative: ORM con migrazioni generate
 * (piu' magia, meno controllo su indici, viste FTS e trigger).
 *
 * Regola: una migrazione applicata non si modifica mai. Si aggiunge un file
 * nuovo. Il checksum registrato serve proprio a rilevare le violazioni.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Db } from './connection.ts';
import { createLogger } from '../core/logger.ts';

const log = createLogger('migrator');

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const FILE_RE = /^(\d{4})_([a-z0-9_]+)\.sql$/;

export type Migration = { version: number; name: string; file: string; sql: string; checksum: string };
export type AppliedMigration = { version: number; name: string; checksum: string; applied_at: string };

function checksumOf(sql: string): string {
  // Normalizza i fine riga: un checkout Windows non deve invalidare i checksum.
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
}

export function loadMigrations(dir: string = MIGRATIONS_DIR): Migration[] {
  if (!fs.existsSync(dir)) return [];
  const migrations = fs
    .readdirSync(dir)
    .filter((f) => FILE_RE.test(f))
    .sort()
    .map((file) => {
      const match = FILE_RE.exec(file);
      if (!match) throw new Error(`Nome migrazione non valido: ${file}`);
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      return {
        version: Number.parseInt(match[1] as string, 10),
        name: match[2] as string,
        file,
        sql,
        checksum: checksumOf(sql),
      };
    });

  const seen = new Set<number>();
  for (const m of migrations) {
    if (seen.has(m.version)) throw new Error(`Versione di migrazione duplicata: ${m.version}`);
    seen.add(m.version);
  }
  return migrations;
}

function ensureRegistry(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      checksum   TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);
}

export function appliedMigrations(db: Db): AppliedMigration[] {
  ensureRegistry(db);
  return db.all<AppliedMigration>('SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version');
}

export type MigrateResult = { applied: number[]; currentVersion: number; alreadyUpToDate: boolean };

export function migrate(db: Db, dir?: string): MigrateResult {
  ensureRegistry(db);
  const available = loadMigrations(dir);
  const applied = new Map(appliedMigrations(db).map((m) => [m.version, m]));

  // Una migrazione gia' applicata e poi modificata a mano e' un bug silenzioso:
  // meglio fermarsi subito che ritrovarsi schemi divergenti fra due macchine.
  for (const m of available) {
    const prev = applied.get(m.version);
    if (prev && prev.checksum !== m.checksum) {
      throw new Error(
        `La migrazione ${m.file} e' cambiata dopo essere stata applicata ` +
          `(checksum ${prev.checksum} -> ${m.checksum}). Creare una nuova migrazione invece di modificarla.`,
      );
    }
  }

  const pending = available.filter((m) => !applied.has(m.version));
  if (pending.length === 0) {
    const current = available.at(-1)?.version ?? 0;
    return { applied: [], currentVersion: current, alreadyUpToDate: true };
  }

  const done: number[] = [];
  for (const m of pending) {
    log.info(`applico migrazione ${m.file}`);
    db.transaction(() => {
      db.exec(m.sql);
      db.run('INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)', m.version, m.name, m.checksum, new Date().toISOString());
    });
    done.push(m.version);
  }

  const currentVersion = available.at(-1)?.version ?? 0;
  log.info(`schema aggiornato alla versione ${currentVersion} (${done.length} migrazioni applicate)`);
  return { applied: done, currentVersion, alreadyUpToDate: false };
}

export function schemaVersion(db: Db): number {
  ensureRegistry(db);
  const row = db.get<{ v: number | null }>('SELECT MAX(version) AS v FROM schema_migrations');
  return row?.v ?? 0;
}

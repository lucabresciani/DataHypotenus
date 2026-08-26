/**
 * Unico punto di accesso a SQLite.
 *
 * Decisione -> Motivazione -> Alternative
 * Si usa `node:sqlite` (modulo core di Node >= 22.5, stabile in Node 24) invece
 * di `better-sqlite3`: nessuna dipendenza nativa da compilare, quindi il
 * progetto si sposta su un mini-PC Linux/ARM con un semplice copia-incolla.
 * Alternative: better-sqlite3 (piu' maturo, ma richiede prebuild o toolchain di
 * compilazione), sql.js (in-memory, non adatto), Postgres (servizio esterno,
 * contro il requisito local-first).
 *
 * Se un domani servisse cambiare driver, questo file e' l'unico da riscrivere:
 * il resto del codice usa solo l'interfaccia `Db`.
 */
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { createLogger } from '../core/logger.ts';

const log = createLogger('db');

/** Valori ammessi come parametro da SQLite (i boolean vengono convertiti). */
export type SqlParam = string | number | bigint | null | Uint8Array | boolean | undefined;

export type RunResult = { changes: number; lastInsertRowid: number };

function normalize(params: SqlParam[]): Array<string | number | bigint | null | Uint8Array> {
  return params.map((p) => {
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (p === undefined) return null;
    return p;
  });
}

export class Db {
  readonly file: string;
  readonly raw: DatabaseSync;
  private readonly cache = new Map<string, StatementSync>();
  private depth = 0;

  constructor(file: string) {
    this.file = file;
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.raw = new DatabaseSync(file);
    this.raw.exec('PRAGMA journal_mode = WAL');
    this.raw.exec('PRAGMA foreign_keys = ON');
    this.raw.exec('PRAGMA busy_timeout = 5000');
    this.raw.exec('PRAGMA synchronous = NORMAL');
    this.raw.exec('PRAGMA temp_store = MEMORY');
  }

  /** Statement preparati e riusati: la cache evita di ricompilare lo stesso SQL. */
  private stmt(sql: string): StatementSync {
    let s = this.cache.get(sql);
    if (!s) {
      s = this.raw.prepare(sql);
      this.cache.set(sql, s);
    }
    return s;
  }

  all<T = Record<string, unknown>>(sql: string, ...params: SqlParam[]): T[] {
    return this.stmt(sql).all(...normalize(params)) as T[];
  }

  get<T = Record<string, unknown>>(sql: string, ...params: SqlParam[]): T | undefined {
    return this.stmt(sql).get(...normalize(params)) as T | undefined;
  }

  run(sql: string, ...params: SqlParam[]): RunResult {
    const r = this.stmt(sql).run(...normalize(params));
    return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
  }

  /** Esegue SQL multi-statement (migrazioni, PRAGMA). Non accetta parametri. */
  exec(sql: string): void {
    this.raw.exec(sql);
  }

  /**
   * Transazione. Supporta l'annidamento tramite SAVEPOINT, cosi' un service puo'
   * chiamarne un altro senza sapere se e' gia' dentro una transazione.
   */
  transaction<T>(fn: () => T): T {
    const nested = this.depth > 0;
    const name = `sp_${this.depth}`;
    this.raw.exec(nested ? `SAVEPOINT ${name}` : 'BEGIN');
    this.depth++;
    try {
      const result = fn();
      this.depth--;
      this.raw.exec(nested ? `RELEASE ${name}` : 'COMMIT');
      return result;
    } catch (err) {
      this.depth--;
      try {
        this.raw.exec(nested ? `ROLLBACK TO ${name}` : 'ROLLBACK');
        if (nested) this.raw.exec(`RELEASE ${name}`);
      } catch (rollbackErr) {
        log.error('rollback fallito', rollbackErr);
      }
      throw err;
    }
  }

  /** Copia consistente del database in un altro file (usata dal backup). */
  vacuumInto(target: string): void {
    // VACUUM INTO non ammette parametri: il path va inline, quindi va quotato.
    this.raw.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  }

  /** Verifica di integrita' del file (usata dal backup e dalla diagnostica). */
  integrityCheck(): string {
    const row = this.get<{ integrity_check: string }>('PRAGMA integrity_check');
    return row?.integrity_check ?? 'unknown';
  }

  close(): void {
    this.cache.clear();
    try {
      this.raw.exec('PRAGMA optimize');
      this.raw.close();
    } catch (err) {
      log.warn('chiusura database non pulita', err);
    }
  }
}

let instance: Db | null = null;

/** Apre (una sola volta) la connessione condivisa del processo. */
export function initDb(file: string): Db {
  if (!instance) {
    instance = new Db(file);
    log.info(`database aperto: ${file}`);
  }
  return instance;
}

/** Connessione condivisa del processo. Richiede una initDb() precedente. */
export function getDb(): Db {
  if (!instance) throw new Error("getDb(): connessione non inizializzata, chiamare prima initDb()");
  return instance;
}

export function setDb(db: Db): void {
  instance = db;
}

export function closeDb(): void {
  instance?.close();
  instance = null;
}

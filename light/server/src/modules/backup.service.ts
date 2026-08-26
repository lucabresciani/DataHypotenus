/**
 * Backup e ripristino.
 *
 * Decisione -> Motivazione -> Alternative (D-07)
 * Un backup e' una CARTELLA, non un archivio: contiene una copia consistente del
 * database (VACUUM INTO, sicura anche a server acceso), la copia degli allegati
 * e un `manifest.json` con lo SHA-256 di ogni file. Vantaggi: nessuna dipendenza
 * per creare zip, verifica dell'integrita' immediata, e soprattutto un backup
 * ispezionabile e ripristinabile a mano anche senza questa applicazione.
 * Alternative: archivio .zip (serve una libreria, e un archivio corrotto si
 * perde tutto), copia del solo .db (perderebbe gli allegati - errore classico).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { config } from '../config.ts';
import { getDb, initDb, closeDb, Db } from '../db/connection.ts';
import { schemaVersion } from '../db/migrator.ts';
import { backupStamp, nowIso } from '../core/dates.ts';
import { badRequest, notFound } from '../core/errors.ts';
import { createLogger } from '../core/logger.ts';

const log = createLogger('backup');

const MANIFEST = 'manifest.json';
const DB_FILENAME = 'datahypotenus.db';
const NAME_RE = /^[A-Za-z0-9._-]+$/;

export type BackupManifest = {
  app: string;
  created_at: string;
  label: string | null;
  schema_version: number;
  database: { filename: string; bytes: number; sha256: string };
  attachments: Array<{ rel_path: string; bytes: number; sha256: string }>;
  counts: Record<string, number>;
};

export type BackupInfo = {
  name: string;
  created_at: string;
  label: string | null;
  bytes: number;
  files: number;
  schema_version: number;
  valid: boolean;
};

function sha256File(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function backupDir(name: string): string {
  if (!NAME_RE.test(name)) throw badRequest('Nome di backup non valido');
  const dir = path.join(config.backupsDir, name);
  if (!fs.existsSync(dir)) throw notFound('Backup', name);
  return dir;
}

function directorySize(dir: string): number {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? directorySize(full) : fs.statSync(full).size;
  }
  return total;
}

/** Nome libero: il timestamp ha risoluzione al secondo, due backup ravvicinati
 *  devono comunque poter coesistere. */
function uniqueBackupName(): string {
  const base = backupStamp();
  let name = base;
  let suffix = 1;
  while (fs.existsSync(path.join(config.backupsDir, name))) name = `${base}-${suffix++}`;
  return name;
}

export function createBackup(label?: string, db: Db = getDb()): BackupInfo {
  fs.mkdirSync(config.backupsDir, { recursive: true });
  const name = uniqueBackupName();
  const dir = path.join(config.backupsDir, name);
  fs.mkdirSync(dir, { recursive: true });

  try {
    // 1. Database: VACUUM INTO produce una copia consistente e compattata
    //    anche con il server acceso e transazioni in corso.
    const dbTarget = path.join(dir, DB_FILENAME);
    db.vacuumInto(dbTarget);

    // 2. Allegati: solo i blob effettivamente registrati nel database.
    const files = db.all<{ rel_path: string; sha256: string; byte_size: number }>(
      'SELECT rel_path, sha256, byte_size FROM files',
    );
    const attachments: BackupManifest['attachments'] = [];
    for (const file of files) {
      const source = path.join(config.attachmentsDir, file.rel_path);
      if (!fs.existsSync(source)) {
        log.warn(`allegato mancante, escluso dal backup: ${file.rel_path}`);
        continue;
      }
      const target = path.join(dir, 'attachments', file.rel_path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
      attachments.push({ rel_path: file.rel_path, bytes: file.byte_size, sha256: file.sha256 });
    }

    const counts = db.get<Record<string, number>>(`
      SELECT (SELECT COUNT(*) FROM items) AS items,
             (SELECT COUNT(*) FROM categories) AS categories,
             (SELECT COUNT(*) FROM locations) AS locations,
             (SELECT COUNT(*) FROM attachments) AS attachments,
             (SELECT COUNT(*) FROM shopping_items) AS shopping_items
    `);

    const manifest: BackupManifest = {
      app: 'datahypotenus',
      created_at: nowIso(),
      label: label?.trim() || null,
      schema_version: schemaVersion(db),
      database: { filename: DB_FILENAME, bytes: fs.statSync(dbTarget).size, sha256: sha256File(dbTarget) },
      attachments,
      counts: counts ?? {},
    };
    fs.writeFileSync(path.join(dir, MANIFEST), JSON.stringify(manifest, null, 2), 'utf8');

    log.info(`backup creato: ${name} (${attachments.length} allegati)`);
    pruneBackups();
    return {
      name,
      created_at: manifest.created_at,
      label: manifest.label,
      bytes: directorySize(dir),
      files: attachments.length,
      schema_version: manifest.schema_version,
      valid: true,
    };
  } catch (err) {
    // Un backup incompleto e' peggio di nessun backup: si rimuove.
    fs.rmSync(dir, { recursive: true, force: true });
    log.error('creazione backup fallita', err);
    throw err;
  }
}

export function readManifest(name: string): BackupManifest {
  const file = path.join(backupDir(name), MANIFEST);
  if (!fs.existsSync(file)) throw notFound('Manifest del backup', name);
  return JSON.parse(fs.readFileSync(file, 'utf8')) as BackupManifest;
}

export function listBackups(): BackupInfo[] {
  if (!fs.existsSync(config.backupsDir)) return [];
  return fs
    .readdirSync(config.backupsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((entry) => {
      const dir = path.join(config.backupsDir, entry.name);
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(dir, MANIFEST), 'utf8')) as BackupManifest;
        return {
          name: entry.name,
          created_at: manifest.created_at,
          label: manifest.label,
          bytes: directorySize(dir),
          files: manifest.attachments.length,
          schema_version: manifest.schema_version,
          valid: true,
        };
      } catch {
        return {
          name: entry.name,
          created_at: fs.statSync(dir).mtime.toISOString(),
          label: null,
          bytes: directorySize(dir),
          files: 0,
          schema_version: 0,
          valid: false,
        };
      }
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

export type VerifyReport = {
  name: string;
  ok: boolean;
  database_ok: boolean;
  attachments_ok: number;
  attachments_bad: string[];
  attachments_missing: string[];
};

/** Verifica che i file del backup esistano e che gli hash corrispondano. */
export function verifyBackup(name: string): VerifyReport {
  const dir = backupDir(name);
  const manifest = readManifest(name);
  const dbFile = path.join(dir, manifest.database.filename);
  const databaseOk = fs.existsSync(dbFile) && sha256File(dbFile) === manifest.database.sha256;

  const bad: string[] = [];
  const missing: string[] = [];
  let ok = 0;
  for (const file of manifest.attachments) {
    const full = path.join(dir, 'attachments', file.rel_path);
    if (!fs.existsSync(full)) missing.push(file.rel_path);
    else if (sha256File(full) !== file.sha256) bad.push(file.rel_path);
    else ok++;
  }

  return {
    name,
    ok: databaseOk && bad.length === 0 && missing.length === 0,
    database_ok: databaseOk,
    attachments_ok: ok,
    attachments_bad: bad,
    attachments_missing: missing,
  };
}

export type RestoreReport = {
  name: string;
  dry_run: boolean;
  safety_backup: string | null;
  database_restored: boolean;
  attachments_restored: number;
  verification: VerifyReport;
};

/**
 * Ripristino. Prima di toccare qualsiasi cosa: verifica del backup e copia di
 * sicurezza dello stato attuale. Se il ripristino andasse storto, i dati di
 * adesso sono comunque recuperabili.
 */
export function restoreBackup(name: string, options: { dryRun?: boolean } = {}): RestoreReport {
  const dir = backupDir(name);
  const manifest = readManifest(name);
  const verification = verifyBackup(name);
  if (!verification.ok) {
    throw badRequest('Il backup non supera la verifica di integrità: ripristino annullato', verification);
  }

  if (options.dryRun) {
    return {
      name,
      dry_run: true,
      safety_backup: null,
      database_restored: false,
      attachments_restored: manifest.attachments.length,
      verification,
    };
  }

  const safety = createBackup(`pre-restore-${name}`);

  // La connessione va chiusa: il file del database viene sostituito sotto.
  closeDb();

  try {
    for (const suffix of ['', '-wal', '-shm']) {
      const file = `${config.dbPath}${suffix}`;
      if (fs.existsSync(file)) fs.rmSync(file);
    }
    fs.copyFileSync(path.join(dir, manifest.database.filename), config.dbPath);

    let restored = 0;
    for (const file of manifest.attachments) {
      const source = path.join(dir, 'attachments', file.rel_path);
      const target = path.join(config.attachmentsDir, file.rel_path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
      restored++;
    }

    log.info(`ripristino completato da ${name}: ${restored} allegati`);
    return { name, dry_run: false, safety_backup: safety.name, database_restored: true, attachments_restored: restored, verification };
  } finally {
    initDb(config.dbPath); // riapre sempre, anche in caso di errore
  }
}

export function deleteBackup(name: string): { deleted: string } {
  const dir = backupDir(name);
  fs.rmSync(dir, { recursive: true, force: true });
  log.info(`backup eliminato: ${name}`);
  return { deleted: name };
}

/** Conserva solo gli ultimi N backup (i "pre-restore" non si toccano). */
export function pruneBackups(keep: number = config.backupKeep): string[] {
  const removable = listBackups().filter((b) => !(b.label ?? '').startsWith('pre-restore'));
  const excess = removable.slice(keep);
  for (const backup of excess) {
    fs.rmSync(path.join(config.backupsDir, backup.name), { recursive: true, force: true });
    log.info(`backup ruotato via: ${backup.name}`);
  }
  return excess.map((b) => b.name);
}

/** Backup automatico all'avvio se l'ultimo e' piu' vecchio della soglia. */
export function autoBackupIfNeeded(db: Db = getDb()): BackupInfo | null {
  if (config.autoBackupHours <= 0) return null;
  const latest = listBackups()[0];
  if (latest) {
    const ageHours = (Date.now() - new Date(latest.created_at).getTime()) / 3_600_000;
    if (ageHours < config.autoBackupHours) return null;
  }
  const hasData = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM items')?.n ?? 0;
  if (hasData === 0) return null; // niente da salvare, niente rumore
  return createBackup('automatico', db);
}

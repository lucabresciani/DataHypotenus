/**
 * Allegati: foto, ricevute, fatture, manuali, garanzie.
 *
 * Decisione -> Motivazione -> Alternative (D-05)
 * I file sono salvati in uno store indirizzato dal contenuto:
 *   DATA_DIR/attachments/<aa>/<bb>/<sha256>.<ext>
 * Vantaggi: lo stesso file caricato due volte occupa un blob solo; il nome sul
 * disco non dipende da caratteri strani nel nome originale; l'integrita' e'
 * verificabile ricalcolando l'hash. La riga `attachments` e' il collegamento
 * logico a un'entita': cancellarla NON cancella il blob, che sparisce solo se
 * nessun altro lo referenzia (garbage collection esplicita).
 * Alternative: BLOB dentro SQLite (database enorme, backup lenti, niente
 * streaming al browser), cartella per oggetto (duplicati e rinomine fragili).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Db } from '../db/connection.ts';
import { getDb } from '../db/connection.ts';
import { config } from '../config.ts';
import { badRequest, notFound } from '../core/errors.ts';
import { createLogger } from '../core/logger.ts';

const log = createLogger('attachments');

export const ATTACHMENT_KINDS = ['photo', 'receipt', 'invoice', 'manual', 'warranty', 'other'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const ENTITY_TYPES = ['item', 'shopping_item', 'maintenance', 'location'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export type AttachmentRow = {
  id: number;
  file_id: number;
  entity_type: EntityType;
  entity_id: number;
  kind: AttachmentKind;
  title: string | null;
  original_filename: string;
  is_primary: number;
  sort_order: number;
  created_at: string;
  sha256: string;
  byte_size: number;
  mime: string;
  rel_path: string;
};

const SELECT_ALL = `
  SELECT a.*, f.sha256, f.byte_size, f.mime, f.rel_path
  FROM attachments a JOIN files f ON f.id = a.file_id
`;

/** Estensione sicura ricavata dal nome originale (max 8 caratteri alfanumerici). */
function safeExtension(filename: string): string {
  const ext = path.extname(filename).replace(/[^a-zA-Z0-9.]/g, '').toLowerCase();
  return ext.length > 1 && ext.length <= 9 ? ext : '';
}

function relPathFor(sha: string, ext: string): string {
  return path.posix.join(sha.slice(0, 2), sha.slice(2, 4), `${sha}${ext}`);
}

export function absolutePathOf(relPath: string): string {
  const full = path.resolve(config.attachmentsDir, relPath);
  // Difesa in profondita': un rel_path manomesso non deve uscire dallo store.
  if (!full.startsWith(path.resolve(config.attachmentsDir))) throw badRequest('Percorso allegato non valido');
  return full;
}

function guessKind(mime: string, requested?: AttachmentKind): AttachmentKind {
  if (requested && ATTACHMENT_KINDS.includes(requested)) return requested;
  return mime.startsWith('image/') ? 'photo' : 'other';
}

export type SaveAttachmentInput = {
  buffer: Buffer;
  filename: string;
  mime: string;
  entity_type: EntityType;
  entity_id: number;
  kind?: AttachmentKind;
  title?: string | null;
};

export function saveAttachment(input: SaveAttachmentInput, db: Db = getDb()): AttachmentRow {
  if (!ENTITY_TYPES.includes(input.entity_type)) throw badRequest(`Tipo di entita non valido: ${input.entity_type}`);
  if (input.buffer.length === 0) throw badRequest('Il file è vuoto');
  if (input.buffer.length > config.maxUploadBytes) {
    throw badRequest(`File troppo grande (max ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB)`);
  }

  const sha = createHash('sha256').update(input.buffer).digest('hex');
  const ext = safeExtension(input.filename);
  const rel = relPathFor(sha, ext);
  const abs = absolutePathOf(rel);

  // Scrittura atomica: prima su file temporaneo, poi rename.
  if (!fs.existsSync(abs)) {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const tmp = `${abs}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, input.buffer);
    fs.renameSync(tmp, abs);
    log.info(`nuovo blob salvato ${rel} (${input.buffer.length} byte)`);
  }

  return db.transaction(() => {
    let file = db.get<{ id: number }>('SELECT id FROM files WHERE sha256 = ?', sha);
    if (!file) {
      const res = db.run(
        'INSERT INTO files (sha256, byte_size, mime, ext, rel_path) VALUES (?, ?, ?, ?, ?)',
        sha,
        input.buffer.length,
        input.mime || 'application/octet-stream',
        ext,
        rel,
      );
      file = { id: res.lastInsertRowid };
    }

    const kind = guessKind(input.mime, input.kind);
    const existingPhotos = db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM attachments WHERE entity_type = ? AND entity_id = ? AND kind = 'photo'",
      input.entity_type,
      input.entity_id,
    );
    const isPrimary = kind === 'photo' && (existingPhotos?.n ?? 0) === 0;

    const res = db.run(
      `INSERT INTO attachments (file_id, entity_type, entity_id, kind, title, original_filename, is_primary, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      file.id,
      input.entity_type,
      input.entity_id,
      kind,
      input.title ?? null,
      input.filename.slice(0, 255),
      isPrimary,
      0,
    );
    return getAttachment(res.lastInsertRowid, db);
  });
}

export function getAttachment(id: number, db: Db = getDb()): AttachmentRow {
  const row = db.get<AttachmentRow>(`${SELECT_ALL} WHERE a.id = ?`, id);
  if (!row) throw notFound('Allegato', id);
  return row;
}

export function listAttachments(entityType: EntityType, entityId: number, db: Db = getDb()): AttachmentRow[] {
  return db.all<AttachmentRow>(
    `${SELECT_ALL} WHERE a.entity_type = ? AND a.entity_id = ?
     ORDER BY a.kind, a.is_primary DESC, a.sort_order, a.id`,
    entityType,
    entityId,
  );
}

export function updateAttachment(
  id: number,
  input: { title?: string | null; kind?: AttachmentKind; is_primary?: boolean; sort_order?: number },
  db: Db = getDb(),
): AttachmentRow {
  const current = getAttachment(id, db);
  return db.transaction(() => {
    if (input.title !== undefined) db.run('UPDATE attachments SET title = ? WHERE id = ?', input.title, id);
    if (input.kind !== undefined) {
      if (!ATTACHMENT_KINDS.includes(input.kind)) throw badRequest(`Tipo di allegato non valido: ${input.kind}`);
      db.run('UPDATE attachments SET kind = ? WHERE id = ?', input.kind, id);
    }
    if (input.sort_order !== undefined) db.run('UPDATE attachments SET sort_order = ? WHERE id = ?', input.sort_order, id);
    if (input.is_primary) {
      db.run('UPDATE attachments SET is_primary = 0 WHERE entity_type = ? AND entity_id = ?', current.entity_type, current.entity_id);
      db.run('UPDATE attachments SET is_primary = 1 WHERE id = ?', id);
    }
    return getAttachment(id, db);
  });
}

/** Rimuove il collegamento logico. Il blob resta finche' e' referenziato. */
export function deleteAttachment(id: number, db: Db = getDb()): { deleted: number; blob_kept: boolean } {
  const current = getAttachment(id, db);
  return db.transaction(() => {
    const res = db.run('DELETE FROM attachments WHERE id = ?', id);
    const remaining = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM attachments WHERE file_id = ?', current.file_id);
    return { deleted: res.changes, blob_kept: (remaining?.n ?? 0) > 0 };
  });
}

export type GcReport = { removed_files: number; freed_bytes: number; missing_on_disk: string[] };

/**
 * Garbage collection dei blob non piu' referenziati da alcun allegato.
 * Operazione esplicita (CLI o Impostazioni): non deve mai partire da sola
 * durante una cancellazione, altrimenti un errore di click diventa perdita dati.
 */
export function collectGarbage(dryRun = false, db: Db = getDb()): GcReport {
  const orphans = db.all<{ id: number; rel_path: string; byte_size: number; sha256: string }>(
    'SELECT id, rel_path, byte_size, sha256 FROM files WHERE id NOT IN (SELECT file_id FROM attachments)',
  );
  const missing: string[] = [];
  let freed = 0;
  let removed = 0;

  for (const file of orphans) {
    const abs = absolutePathOf(file.rel_path);
    if (dryRun) {
      freed += file.byte_size;
      removed++;
      continue;
    }
    try {
      if (fs.existsSync(abs)) {
        fs.unlinkSync(abs);
        freed += file.byte_size;
      } else {
        missing.push(file.rel_path);
      }
      db.run('DELETE FROM files WHERE id = ?', file.id);
      removed++;
    } catch (err) {
      log.error(`impossibile rimuovere il blob ${file.rel_path}`, err);
    }
  }
  if (removed > 0) log.info(`garbage collection: ${removed} blob rimossi, ${freed} byte liberati${dryRun ? ' (simulazione)' : ''}`);
  return { removed_files: removed, freed_bytes: freed, missing_on_disk: missing };
}

export type StorageCheck = {
  files: number;
  attachments: number;
  total_bytes: number;
  missing: Array<{ id: number; rel_path: string }>;
  corrupted: Array<{ id: number; rel_path: string }>;
  orphan_blobs: number;
};

/** Verifica che ogni file registrato esista e che il contenuto corrisponda all'hash. */
export function checkStorage(deep = false, db: Db = getDb()): StorageCheck {
  const files = db.all<{ id: number; rel_path: string; sha256: string; byte_size: number }>(
    'SELECT id, rel_path, sha256, byte_size FROM files',
  );
  const missing: Array<{ id: number; rel_path: string }> = [];
  const corrupted: Array<{ id: number; rel_path: string }> = [];
  let totalBytes = 0;

  for (const file of files) {
    const abs = absolutePathOf(file.rel_path);
    if (!fs.existsSync(abs)) {
      missing.push({ id: file.id, rel_path: file.rel_path });
      continue;
    }
    totalBytes += file.byte_size;
    if (deep) {
      const hash = createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
      if (hash !== file.sha256) corrupted.push({ id: file.id, rel_path: file.rel_path });
    }
  }

  const counts = db.get<{ attachments: number; orphans: number }>(
    `SELECT (SELECT COUNT(*) FROM attachments) AS attachments,
            (SELECT COUNT(*) FROM files WHERE id NOT IN (SELECT file_id FROM attachments)) AS orphans`,
  );

  return {
    files: files.length,
    attachments: counts?.attachments ?? 0,
    total_bytes: totalBytes,
    missing,
    corrupted,
    orphan_blobs: counts?.orphans ?? 0,
  };
}

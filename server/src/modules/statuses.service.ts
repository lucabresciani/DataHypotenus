/**
 * Stati degli oggetti: configurabili dall'utente.
 *
 * L'applicazione non guarda mai l'etichetta ma i flag semantici:
 *   counts_as_owned -> l'oggetto entra nei conteggi e nel valore dell'inventario
 *   is_wishlist     -> l'oggetto compare fra le cose ancora da comprare
 * Cosi' rinominare "Posseduto" in "A casa" non rompe dashboard e statistiche.
 */
import type { Db } from '../db/connection.ts';
import { getDb } from '../db/connection.ts';
import { badRequest, conflict, notFound } from '../core/errors.ts';
import { nowIso } from '../core/dates.ts';

export type StatusRow = {
  id: number;
  key: string;
  label: string;
  color: string | null;
  counts_as_owned: number;
  is_wishlist: number;
  is_default: number;
  is_system: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  item_count: number;
};

export type StatusInput = {
  key?: string;
  label: string;
  color?: string | null;
  counts_as_owned?: boolean;
  is_wishlist?: boolean;
  is_default?: boolean;
  sort_order?: number;
};

const SELECT_ALL = `
  SELECT s.*, (SELECT COUNT(*) FROM items i WHERE i.status_id = s.id AND i.deleted_at IS NULL) AS item_count
  FROM item_statuses s
`;

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

export function listStatuses(db: Db = getDb()): StatusRow[] {
  return db.all<StatusRow>(`${SELECT_ALL} ORDER BY s.sort_order, s.label COLLATE NOCASE`);
}

export function getStatus(id: number, db: Db = getDb()): StatusRow {
  const row = db.get<StatusRow>(`${SELECT_ALL} WHERE s.id = ?`, id);
  if (!row) throw notFound('Stato', id);
  return row;
}

export function getStatusByKey(key: string, db: Db = getDb()): StatusRow | undefined {
  return db.get<StatusRow>(`${SELECT_ALL} WHERE s.key = ?`, key);
}

/** Stato preselezionato nei form (fallback: il primo per ordinamento). */
export function defaultStatus(db: Db = getDb()): StatusRow {
  const row =
    db.get<StatusRow>(`${SELECT_ALL} WHERE s.is_default = 1 ORDER BY s.sort_order LIMIT 1`) ??
    db.get<StatusRow>(`${SELECT_ALL} ORDER BY s.sort_order LIMIT 1`);
  if (!row) throw notFound('Stato predefinito');
  return row;
}

/**
 * L'etichetta e' l'unica cosa che l'utente vede: due stati con la stessa
 * etichetta sono indistinguibili in ogni menu a tendina, in ogni tabella e in
 * ogni badge, anche se hanno chiavi diverse. Qui l'etichetta e' unica.
 */
function assertLabelIsFree(label: string, exceptId: number | undefined, db: Db): void {
  const clash = db.get<{ id: number; label: string }>(
    `SELECT id, label FROM item_statuses WHERE label = ? COLLATE NOCASE AND id IS NOT ?`,
    label,
    exceptId ?? null,
  );
  if (clash) throw conflict(`Esiste già uno stato chiamato "${clash.label}"`);
}

export function createStatus(input: StatusInput, db: Db = getDb()): StatusRow {
  const label = input.label?.trim();
  if (!label) throw badRequest('L’etichetta dello stato è obbligatoria');
  const key = slugify(input.key ?? label);
  if (!key) throw badRequest('Chiave dello stato non valida');
  assertLabelIsFree(label, undefined, db);
  if (db.get('SELECT 1 FROM item_statuses WHERE key = ?', key)) {
    throw conflict(`Esiste già uno stato con chiave "${key}"`);
  }
  return db.transaction(() => {
    if (input.is_default) db.run('UPDATE item_statuses SET is_default = 0');
    const res = db.run(
      `INSERT INTO item_statuses (key, label, color, counts_as_owned, is_wishlist, is_default, is_system, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      key,
      label,
      input.color ?? null,
      input.counts_as_owned ?? true,
      input.is_wishlist ?? false,
      input.is_default ?? false,
      input.sort_order ?? 999,
    );
    return getStatus(res.lastInsertRowid, db);
  });
}

export function updateStatus(id: number, input: Partial<StatusInput>, db: Db = getDb()): StatusRow {
  getStatus(id, db);
  const sets: string[] = [];
  const params: Array<string | number | null> = [];
  const push = (col: string, val: string | number | null) => {
    sets.push(`${col} = ?`);
    params.push(val);
  };

  if (input.label !== undefined) {
    const label = input.label.trim();
    if (!label) throw badRequest('L’etichetta dello stato è obbligatoria');
    assertLabelIsFree(label, id, db);
    push('label', label);
  }
  if (input.color !== undefined) push('color', input.color);
  if (input.counts_as_owned !== undefined) push('counts_as_owned', input.counts_as_owned ? 1 : 0);
  if (input.is_wishlist !== undefined) push('is_wishlist', input.is_wishlist ? 1 : 0);
  if (input.sort_order !== undefined) push('sort_order', input.sort_order);

  return db.transaction(() => {
    if (input.is_default) {
      db.run('UPDATE item_statuses SET is_default = 0');
      push('is_default', 1);
    }
    if (sets.length > 0) {
      push('updated_at', nowIso());
      db.run(`UPDATE item_statuses SET ${sets.join(', ')} WHERE id = ?`, ...params, id);
    }
    return getStatus(id, db);
  });
}

/**
 * Eliminazione: gli stati di sistema non si toccano e uno stato ancora usato va
 * prima sostituito (parametro `reassignTo`), altrimenti gli oggetti resterebbero
 * senza stato, che lo schema non ammette.
 */
export function deleteStatus(id: number, reassignTo: number | undefined, db: Db = getDb()): { deleted: number; moved: number } {
  const status = getStatus(id, db);
  if (status.is_system) throw conflict(`Lo stato "${status.label}" è di sistema e non può essere eliminato`);

  return db.transaction(() => {
    let moved = 0;
    if (status.item_count > 0) {
      if (reassignTo === undefined) {
        throw conflict(
          `Lo stato "${status.label}" è usato da ${status.item_count} ${status.item_count === 1 ? 'oggetto' : 'oggetti'}: indica lo stato sostitutivo`,
          { item_count: status.item_count },
        );
      }
      getStatus(reassignTo, db);
      moved = db.run('UPDATE items SET status_id = ? WHERE status_id = ?', reassignTo, id).changes;
    }
    const res = db.run('DELETE FROM item_statuses WHERE id = ?', id);
    return { deleted: res.changes, moved };
  });
}

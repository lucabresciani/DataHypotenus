/**
 * Negozi / venditori. Entita' propria invece di una stringa ripetuta su ogni
 * oggetto: permette di aggregare la spesa per negozio e di correggere un nome
 * sbagliato in un punto solo (requisito 26).
 */
import type { Db } from '../db/connection.ts';
import { getDb } from '../db/connection.ts';
import { badRequest, notFound } from '../core/errors.ts';
import { nowIso } from '../core/dates.ts';

export type VendorRow = {
  id: number;
  name: string;
  website: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  item_count: number;
};

const SELECT_ALL = `
  SELECT v.id, v.name, v.website, v.notes, v.created_at, v.updated_at,
         (SELECT COUNT(*) FROM items i WHERE i.vendor_id = v.id AND i.deleted_at IS NULL) AS item_count
  FROM vendors v
`;

function cleanName(name: unknown): string {
  const value = typeof name === 'string' ? name.trim() : '';
  if (!value) throw badRequest('Il nome del negozio è obbligatorio');
  if (value.length > 120) throw badRequest('Il nome del negozio è troppo lungo (max 120 caratteri)');
  return value;
}

export function listVendors(db: Db = getDb()): VendorRow[] {
  return db.all<VendorRow>(`${SELECT_ALL} ORDER BY v.name COLLATE NOCASE`);
}

export function getVendor(id: number, db: Db = getDb()): VendorRow {
  const row = db.get<VendorRow>(`${SELECT_ALL} WHERE v.id = ?`, id);
  if (!row) throw notFound('Negozio', id);
  return row;
}

export function createVendor(input: { name: string; website?: string | null; notes?: string | null }, db: Db = getDb()): VendorRow {
  const name = cleanName(input.name);
  const existing = db.get<{ id: number }>('SELECT id FROM vendors WHERE name = ? COLLATE NOCASE', name);
  if (existing) return getVendor(existing.id, db);
  const res = db.run('INSERT INTO vendors (name, website, notes) VALUES (?, ?, ?)', name, input.website ?? null, input.notes ?? null);
  return getVendor(res.lastInsertRowid, db);
}

export function updateVendor(id: number, input: { name?: string; website?: string | null; notes?: string | null }, db: Db = getDb()): VendorRow {
  getVendor(id, db);
  const sets: string[] = [];
  const params: Array<string | null> = [];
  if (input.name !== undefined) {
    sets.push('name = ?');
    params.push(cleanName(input.name));
  }
  if (input.website !== undefined) {
    sets.push('website = ?');
    params.push(input.website);
  }
  if (input.notes !== undefined) {
    sets.push('notes = ?');
    params.push(input.notes);
  }
  if (sets.length > 0) {
    sets.push('updated_at = ?');
    params.push(nowIso());
    db.run(`UPDATE vendors SET ${sets.join(', ')} WHERE id = ?`, ...params, id);
  }
  return getVendor(id, db);
}

/** Il negozio si puo' sempre eliminare: gli oggetti restano, senza venditore. */
export function deleteVendor(id: number, db: Db = getDb()): { deleted: number } {
  getVendor(id, db);
  return { deleted: db.run('DELETE FROM vendors WHERE id = ?', id).changes };
}

/** Risolve un nome libero in un id, creando il negozio se non esiste. */
export function resolveVendorId(name: string | null | undefined, db: Db = getDb()): number | null {
  if (!name || !name.trim()) return null;
  return createVendor({ name }, db).id;
}

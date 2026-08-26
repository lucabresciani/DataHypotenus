/**
 * Tag: etichette trasversali alle categorie ("costoso", "trasloco", "lavoro").
 * Relazione N:N con gli oggetti, nomi unici case-insensitive.
 */
import type { Db } from '../db/connection.ts';
import { getDb } from '../db/connection.ts';
import { badRequest, notFound } from '../core/errors.ts';

export type TagRow = { id: number; name: string; color: string | null; created_at: string; item_count: number };

const SELECT_ALL = `
  SELECT t.id, t.name, t.color, t.created_at,
         (SELECT COUNT(*) FROM item_tags it JOIN items i ON i.id = it.item_id
          WHERE it.tag_id = t.id AND i.deleted_at IS NULL) AS item_count
  FROM tags t
`;

function cleanName(name: unknown): string {
  const value = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
  if (!value) throw badRequest('Il nome del tag è obbligatorio');
  if (value.length > 60) throw badRequest('Il nome del tag è troppo lungo (max 60 caratteri)');
  return value;
}

export function listTags(db: Db = getDb()): TagRow[] {
  return db.all<TagRow>(`${SELECT_ALL} ORDER BY t.name COLLATE NOCASE`);
}

export function getTag(id: number, db: Db = getDb()): TagRow {
  const row = db.get<TagRow>(`${SELECT_ALL} WHERE t.id = ?`, id);
  if (!row) throw notFound('Tag', id);
  return row;
}

export function createTag(input: { name: string; color?: string | null }, db: Db = getDb()): TagRow {
  const name = cleanName(input.name);
  const existing = db.get<{ id: number }>('SELECT id FROM tags WHERE name = ? COLLATE NOCASE', name);
  if (existing) return getTag(existing.id, db); // creare due volte lo stesso tag non e' un errore
  const res = db.run('INSERT INTO tags (name, color) VALUES (?, ?)', name, input.color ?? null);
  return getTag(res.lastInsertRowid, db);
}

export function updateTag(id: number, input: { name?: string; color?: string | null }, db: Db = getDb()): TagRow {
  getTag(id, db);
  if (input.name !== undefined) db.run('UPDATE tags SET name = ? WHERE id = ?', cleanName(input.name), id);
  if (input.color !== undefined) db.run('UPDATE tags SET color = ? WHERE id = ?', input.color, id);
  return getTag(id, db);
}

export function deleteTag(id: number, db: Db = getDb()): { deleted: number } {
  getTag(id, db);
  // item_tags ha ON DELETE CASCADE: i legami spariscono, gli oggetti restano.
  const res = db.run('DELETE FROM tags WHERE id = ?', id);
  return { deleted: res.changes };
}

/** Risolve una lista di nomi in id, creando al volo i tag mancanti. */
export function resolveTagIds(names: string[], db: Db = getDb()): number[] {
  const ids: number[] = [];
  for (const raw of names) {
    const name = cleanName(raw);
    const existing = db.get<{ id: number }>('SELECT id FROM tags WHERE name = ? COLLATE NOCASE', name);
    ids.push(existing ? existing.id : db.run('INSERT INTO tags (name) VALUES (?)', name).lastInsertRowid);
  }
  return [...new Set(ids)];
}

export function setItemTags(itemId: number, tagIds: number[], db: Db = getDb()): void {
  db.transaction(() => {
    db.run('DELETE FROM item_tags WHERE item_id = ?', itemId);
    for (const tagId of new Set(tagIds)) {
      db.run('INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)', itemId, tagId);
    }
  });
}

export function addItemTags(itemId: number, tagIds: number[], db: Db = getDb()): void {
  db.transaction(() => {
    for (const tagId of new Set(tagIds)) {
      db.run('INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)', itemId, tagId);
    }
  });
}

export function tagsOfItem(itemId: number, db: Db = getDb()): Array<{ id: number; name: string; color: string | null }> {
  return db.all<{ id: number; name: string; color: string | null }>(
    `SELECT t.id, t.name, t.color FROM tags t
     JOIN item_tags it ON it.tag_id = t.id
     WHERE it.item_id = ? ORDER BY t.name COLLATE NOCASE`,
    itemId,
  );
}

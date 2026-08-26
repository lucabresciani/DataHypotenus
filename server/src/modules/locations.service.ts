/**
 * Posizioni: un'unica gerarchia per edifici, stanze, aree, mobili, ripiani e
 * contenitori. Una scatola "Trasloco #01" e' una posizione con kind='container'
 * che puo' stare dentro "Garage / Scaffale 3" e contenere a sua volta altro.
 * Vedi docs/DECISIONS.md (D-03).
 */
import type { Db } from '../db/connection.ts';
import { getDb } from '../db/connection.ts';
import { buildTree, descendantIds, wouldCreateCycle, ancestors, type WithChildren } from '../db/tree.ts';
import { badRequest, conflict, notFound } from '../core/errors.ts';
import { nowIso } from '../core/dates.ts';

export const LOCATION_KINDS = [
  'building',
  'floor',
  'room',
  'area',
  'furniture',
  'shelf',
  'container',
  'other',
] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

export type LocationRow = {
  id: number;
  parent_id: number | null;
  name: string;
  kind: LocationKind;
  code: string | null;
  notes: string | null;
  color: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  path: string;
  depth: number;
  room_id: number | null;
  room_name: string | null;
  item_count: number;
};

export type LocationNode = WithChildren<LocationRow> & { total_item_count: number };

export type LocationInput = {
  name: string;
  parent_id?: number | null;
  kind?: LocationKind;
  code?: string | null;
  notes?: string | null;
  color?: string | null;
  sort_order?: number;
};

const SELECT_ALL = `
  SELECT l.id, l.parent_id, l.name, l.kind, l.code, l.notes, l.color, l.sort_order,
         l.created_at, l.updated_at,
         COALESCE(p.path, l.name) AS path,
         COALESCE(p.depth, 0)     AS depth,
         p.room_id, p.room_name,
         (SELECT COUNT(*) FROM items i WHERE i.location_id = l.id AND i.deleted_at IS NULL) AS item_count
  FROM locations l
  LEFT JOIN location_paths p ON p.id = l.id
`;

function cleanName(name: unknown): string {
  const value = typeof name === 'string' ? name.trim() : '';
  if (!value) throw badRequest('Il nome della posizione è obbligatorio');
  if (value.length > 120) throw badRequest('Il nome della posizione è troppo lungo (max 120 caratteri)');
  return value;
}

function cleanKind(kind: unknown): LocationKind {
  if (kind === undefined || kind === null || kind === '') return 'other';
  if (!(LOCATION_KINDS as readonly unknown[]).includes(kind)) {
    throw badRequest(`Tipo di posizione non valido. Ammessi: ${LOCATION_KINDS.join(', ')}`);
  }
  return kind as LocationKind;
}

function assertExists(db: Db, id: number, what = 'Posizione'): LocationRow {
  const row = db.get<LocationRow>(`${SELECT_ALL} WHERE l.id = ?`, id);
  if (!row) throw notFound(what, id);
  return row;
}

export function listLocations(db: Db = getDb()): LocationRow[] {
  return db.all<LocationRow>(`${SELECT_ALL} ORDER BY path COLLATE NOCASE`);
}

export function locationTree(db: Db = getDb()): LocationNode[] {
  const flat = db.all<LocationRow>(`${SELECT_ALL} ORDER BY l.sort_order, l.name COLLATE NOCASE`);
  const roots = buildTree(flat) as LocationNode[];
  const totals = (node: LocationNode): number => {
    node.total_item_count = node.item_count + node.children.reduce((sum, c) => sum + totals(c as LocationNode), 0);
    return node.total_item_count;
  };
  roots.forEach(totals);
  return roots;
}

export function getLocation(id: number, db: Db = getDb()): LocationRow {
  return assertExists(db, id);
}

export function locationBreadcrumb(id: number, db: Db = getDb()): Array<{ id: number; name: string }> {
  return ancestors(db, 'locations', id);
}

export function createLocation(input: LocationInput, db: Db = getDb()): LocationRow {
  const name = cleanName(input.name);
  const parentId = input.parent_id ?? null;
  if (parentId !== null) assertExists(db, parentId, 'Posizione superiore');

  const res = db.run(
    `INSERT INTO locations (parent_id, name, kind, code, notes, color, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    parentId,
    name,
    cleanKind(input.kind),
    input.code?.trim() || null,
    input.notes ?? null,
    input.color ?? null,
    input.sort_order ?? 0,
  );
  return assertExists(db, res.lastInsertRowid);
}

export function updateLocation(id: number, input: Partial<LocationInput>, db: Db = getDb()): LocationRow {
  assertExists(db, id);

  const sets: string[] = [];
  const params: Array<string | number | null> = [];
  const push = (column: string, value: string | number | null) => {
    sets.push(`${column} = ?`);
    params.push(value);
  };

  if (input.name !== undefined) push('name', cleanName(input.name));
  if (input.kind !== undefined) push('kind', cleanKind(input.kind));
  if (input.code !== undefined) push('code', input.code?.trim() || null);
  if (input.notes !== undefined) push('notes', input.notes);
  if (input.color !== undefined) push('color', input.color);
  if (input.sort_order !== undefined) push('sort_order', input.sort_order);
  if (input.parent_id !== undefined) {
    const parentId = input.parent_id;
    if (parentId !== null) {
      assertExists(db, parentId, 'Posizione superiore');
      if (wouldCreateCycle(db, 'locations', id, parentId)) {
        throw conflict('Non e possibile spostare una posizione dentro se stessa o in una sua sotto-posizione');
      }
    }
    push('parent_id', parentId);
  }

  if (sets.length === 0) return assertExists(db, id);
  push('updated_at', nowIso());
  db.run(`UPDATE locations SET ${sets.join(', ')} WHERE id = ?`, ...params, id);
  return assertExists(db, id);
}

export type DeleteLocationResult = { deleted: number; movedChildren: number; detachedItems: number };

export function deleteLocation(id: number, options: { cascade?: boolean } = {}, db: Db = getDb()): DeleteLocationResult {
  const current = assertExists(db, id);

  return db.transaction(() => {
    if (options.cascade) {
      const ids = descendantIds(db, 'locations', id);
      const placeholders = ids.map(() => '?').join(',');
      const detached = db.run(`UPDATE items SET location_id = NULL WHERE location_id IN (${placeholders})`, ...ids);
      db.run(`UPDATE shopping_items SET location_id = NULL WHERE location_id IN (${placeholders})`, ...ids);
      for (const childId of [...ids].reverse()) db.run('DELETE FROM locations WHERE id = ?', childId);
      return { deleted: ids.length, movedChildren: 0, detachedItems: detached.changes };
    }

    const moved = db.run('UPDATE locations SET parent_id = ? WHERE parent_id = ?', current.parent_id, id);
    const detached = db.run('UPDATE items SET location_id = ? WHERE location_id = ?', current.parent_id, id);
    db.run('UPDATE shopping_items SET location_id = ? WHERE location_id = ?', current.parent_id, id);
    db.run('DELETE FROM locations WHERE id = ?', id);
    return { deleted: 1, movedChildren: moved.changes, detachedItems: detached.changes };
  });
}

export function locationWithDescendants(id: number, db: Db = getDb()): number[] {
  return descendantIds(db, 'locations', id);
}

/** Sotto-posizioni dirette: "cosa c'e' dentro questa scatola/stanza". */
export function childLocations(id: number, db: Db = getDb()): LocationRow[] {
  return db.all<LocationRow>(`${SELECT_ALL} WHERE l.parent_id = ? ORDER BY l.sort_order, l.name COLLATE NOCASE`, id);
}

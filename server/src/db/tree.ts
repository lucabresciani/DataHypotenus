/**
 * Operazioni comuni agli alberi (categorie e posizioni).
 * Sono due tabelle diverse ma con la stessa struttura self-referenziale:
 * questo modulo evita di duplicarne la logica.
 */
import type { Db } from './connection.ts';

/** Tabelle ammesse: il nome finisce interpolato nell'SQL, quindi va vincolato. */
export type TreeTable = 'categories' | 'locations';
const TABLES: readonly TreeTable[] = ['categories', 'locations'];

function assertTable(table: TreeTable): void {
  if (!TABLES.includes(table)) throw new Error(`Tabella ad albero non ammessa: ${table}`);
}

/** Id del nodo e di tutti i suoi discendenti (il nodo incluso, se richiesto). */
export function descendantIds(db: Db, table: TreeTable, id: number, includeSelf = true): number[] {
  assertTable(table);
  const rows = db.all<{ id: number }>(
    `WITH RECURSIVE sub(id) AS (
       SELECT id FROM ${table} WHERE id = ?
       UNION ALL
       SELECT t.id FROM ${table} t JOIN sub ON t.parent_id = sub.id
     )
     SELECT id FROM sub`,
    id,
  );
  const ids = rows.map((r) => r.id);
  return includeSelf ? ids : ids.filter((x) => x !== id);
}

/** Catena dal nodo fino alla radice, ordinata dalla radice al nodo. */
export function ancestors(db: Db, table: TreeTable, id: number): Array<{ id: number; name: string }> {
  assertTable(table);
  const rows = db.all<{ id: number; name: string; depth: number }>(
    `WITH RECURSIVE up(id, parent_id, name, depth) AS (
       SELECT id, parent_id, name, 0 FROM ${table} WHERE id = ?
       UNION ALL
       SELECT t.id, t.parent_id, t.name, up.depth + 1 FROM ${table} t JOIN up ON t.id = up.parent_id
     )
     SELECT id, name, depth FROM up ORDER BY depth DESC`,
    id,
  );
  return rows.map(({ id: nodeId, name }) => ({ id: nodeId, name }));
}

/**
 * Vero se spostare `id` sotto `newParentId` creerebbe un ciclo
 * (cioe' se il nuovo genitore e' il nodo stesso o un suo discendente).
 */
export function wouldCreateCycle(db: Db, table: TreeTable, id: number, newParentId: number | null): boolean {
  if (newParentId === null) return false;
  if (newParentId === id) return true;
  return descendantIds(db, table, id).includes(newParentId);
}

export type WithChildren<T> = T & { children: Array<WithChildren<T>> };

/** Trasforma una lista piatta (id, parent_id) in un albero, preservando l'ordine. */
export function buildTree<T extends { id: number; parent_id: number | null }>(rows: T[]): Array<WithChildren<T>> {
  const byId = new Map<number, WithChildren<T>>();
  for (const row of rows) byId.set(row.id, { ...row, children: [] });

  const roots: Array<WithChildren<T>> = [];
  for (const row of rows) {
    const node = byId.get(row.id);
    if (!node) continue;
    const parent = row.parent_id === null ? undefined : byId.get(row.parent_id);
    if (parent) parent.children.push(node);
    else roots.push(node); // orfano o radice: comunque visibile, mai perso
  }
  return roots;
}

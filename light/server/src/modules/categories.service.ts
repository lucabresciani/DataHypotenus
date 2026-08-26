/**
 * Categorie: albero a profondita' libera. "Categoria" e "sottocategoria" sono
 * lo stesso concetto a livelli diversi (vedi assunzione A2 in docs/DECISIONS).
 */
import type { Db } from '../db/connection.ts';
import { getDb } from '../db/connection.ts';
import { buildTree, descendantIds, wouldCreateCycle, type WithChildren } from '../db/tree.ts';
import { badRequest, conflict, notFound } from '../core/errors.ts';
import { nowIso } from '../core/dates.ts';

export type CategoryRow = {
  id: number;
  parent_id: number | null;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  path: string;
  depth: number;
  item_count: number;
};

export type CategoryNode = WithChildren<CategoryRow> & { total_item_count: number };

export type CategoryInput = {
  name: string;
  parent_id?: number | null;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  sort_order?: number;
};

const SELECT_ALL = `
  SELECT c.id, c.parent_id, c.name, c.description, c.icon, c.color, c.sort_order,
         c.created_at, c.updated_at,
         COALESCE(p.path, c.name) AS path,
         COALESCE(p.depth, 0)     AS depth,
         (SELECT COUNT(*) FROM items i WHERE i.category_id = c.id AND i.deleted_at IS NULL) AS item_count
  FROM categories c
  LEFT JOIN category_paths p ON p.id = c.id
`;

function cleanName(name: unknown): string {
  const value = typeof name === 'string' ? name.trim() : '';
  if (!value) throw badRequest('Il nome della categoria è obbligatorio');
  if (value.length > 120) throw badRequest('Il nome della categoria è troppo lungo (max 120 caratteri)');
  return value;
}

function assertExists(db: Db, id: number, what = 'Categoria'): CategoryRow {
  const row = db.get<CategoryRow>(`${SELECT_ALL} WHERE c.id = ?`, id);
  if (!row) throw notFound(what, id);
  return row;
}

export function listCategories(db: Db = getDb()): CategoryRow[] {
  return db.all<CategoryRow>(`${SELECT_ALL} ORDER BY path COLLATE NOCASE`);
}

/** Albero completo con il conteggio degli oggetti propagato ai nodi superiori. */
export function categoryTree(db: Db = getDb()): CategoryNode[] {
  const flat = db.all<CategoryRow>(`${SELECT_ALL} ORDER BY c.sort_order, c.name COLLATE NOCASE`);
  const roots = buildTree(flat) as CategoryNode[];
  const totals = (node: CategoryNode): number => {
    node.total_item_count = node.item_count + node.children.reduce((sum, child) => sum + totals(child as CategoryNode), 0);
    return node.total_item_count;
  };
  roots.forEach(totals);
  return roots;
}

export function getCategory(id: number, db: Db = getDb()): CategoryRow {
  return assertExists(db, id);
}

export function createCategory(input: CategoryInput, db: Db = getDb()): CategoryRow {
  const name = cleanName(input.name);
  const parentId = input.parent_id ?? null;
  if (parentId !== null) assertExists(db, parentId, 'Categoria superiore');

  const res = db.run(
    `INSERT INTO categories (parent_id, name, description, icon, color, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
    parentId,
    name,
    input.description ?? null,
    input.icon ?? null,
    input.color ?? null,
    input.sort_order ?? 0,
  );
  return assertExists(db, res.lastInsertRowid);
}

export function updateCategory(id: number, input: Partial<CategoryInput>, db: Db = getDb()): CategoryRow {
  assertExists(db, id);

  const sets: string[] = [];
  const params: Array<string | number | null> = [];
  const push = (column: string, value: string | number | null) => {
    sets.push(`${column} = ?`);
    params.push(value);
  };

  if (input.name !== undefined) push('name', cleanName(input.name));
  if (input.description !== undefined) push('description', input.description);
  if (input.icon !== undefined) push('icon', input.icon);
  if (input.color !== undefined) push('color', input.color);
  if (input.sort_order !== undefined) push('sort_order', input.sort_order);
  if (input.parent_id !== undefined) {
    const parentId = input.parent_id;
    if (parentId !== null) {
      assertExists(db, parentId, 'Categoria superiore');
      if (wouldCreateCycle(db, 'categories', id, parentId)) {
        throw conflict('Non e possibile spostare una categoria dentro se stessa o in una sua sottocategoria');
      }
    }
    push('parent_id', parentId);
  }

  if (sets.length === 0) return assertExists(db, id);
  push('updated_at', nowIso());
  db.run(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`, ...params, id);
  return assertExists(db, id);
}

export type DeleteCategoryOptions = {
  /** true = elimina anche le sottocategorie; false = le sposta al livello superiore. */
  cascade?: boolean;
};

export type DeleteCategoryResult = { deleted: number; movedChildren: number; detachedItems: number };

/**
 * Cancellazione sicura: per default nessun dato scompare a sorpresa.
 * Le sottocategorie salgono di un livello e gli oggetti passano alla categoria
 * superiore (o restano senza categoria se si cancella una radice).
 */
export function deleteCategory(id: number, options: DeleteCategoryOptions = {}, db: Db = getDb()): DeleteCategoryResult {
  const current = assertExists(db, id);

  return db.transaction(() => {
    if (options.cascade) {
      const ids = descendantIds(db, 'categories', id);
      const placeholders = ids.map(() => '?').join(',');
      const detached = db.run(`UPDATE items SET category_id = NULL WHERE category_id IN (${placeholders})`, ...ids);
      db.run(`UPDATE shopping_items SET category_id = NULL WHERE category_id IN (${placeholders})`, ...ids);
      // Si cancella dalle foglie verso la radice per rispettare la FK RESTRICT.
      for (const childId of [...ids].reverse()) db.run('DELETE FROM categories WHERE id = ?', childId);
      return { deleted: ids.length, movedChildren: 0, detachedItems: detached.changes };
    }

    const moved = db.run('UPDATE categories SET parent_id = ? WHERE parent_id = ?', current.parent_id, id);
    const detached = db.run('UPDATE items SET category_id = ? WHERE category_id = ?', current.parent_id, id);
    db.run('UPDATE shopping_items SET category_id = ? WHERE category_id = ?', current.parent_id, id);
    db.run('DELETE FROM categories WHERE id = ?', id);
    return { deleted: 1, movedChildren: moved.changes, detachedItems: detached.changes };
  });
}

/** Id della categoria e di tutte le sue sottocategorie (per i filtri). */
export function categoryWithDescendants(id: number, db: Db = getDb()): number[] {
  return descendantIds(db, 'categories', id);
}

/**
 * Lista acquisti: cio' che manca ancora in casa.
 *
 * Decisione -> Motivazione -> Alternative (D-06)
 * Entita' separata dagli oggetti perche' un desiderio ha attributi propri
 * (priorita', prezzo stimato, link) e non deve inquinare conteggi e valore
 * dell'inventario. Alla conversione nasce un oggetto vero e il legame resta
 * registrato (`item_id`), cosi' si puo' risalire da cosa e' nato un acquisto.
 * Alternative: un semplice stato "da comprare" sugli oggetti (piu' povero,
 * mischia desideri e possessi in ogni query).
 */
import type { Db } from '../db/connection.ts';
import { getDb } from '../db/connection.ts';
import { badRequest, conflict, notFound } from '../core/errors.ts';
import { nowIso, todayIso } from '../core/dates.ts';
import { createItem, recordEvent } from './items.service.ts';
import { getSetting } from './settings.service.ts';
import { getStatusByKey } from './statuses.service.ts';
import type { ItemView } from './items.types.ts';

export const PRIORITIES = ['bassa', 'media', 'alta', 'urgente'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const SHOPPING_STATUSES = ['da_comprare', 'ordinato', 'acquistato', 'annullato'] as const;
export type ShoppingStatus = (typeof SHOPPING_STATUSES)[number];

export type ShoppingRow = {
  id: number;
  name: string;
  notes: string | null;
  category_id: number | null;
  category_path: string | null;
  location_id: number | null;
  location_path: string | null;
  vendor_id: number | null;
  vendor_name: string | null;
  desired_quantity: number;
  unit: string;
  estimated_price: number | null;
  currency: string;
  priority: Priority;
  status: ShoppingStatus;
  url: string | null;
  item_id: number | null;
  source_item_id: number | null;
  purchased_at: string | null;
  created_at: string;
  updated_at: string;
  estimated_total: number | null;
};

export type ShoppingInput = {
  name: string;
  notes?: string | null;
  category_id?: number | null;
  location_id?: number | null;
  vendor_id?: number | null;
  desired_quantity?: number;
  unit?: string;
  estimated_price?: number | null;
  currency?: string;
  priority?: Priority;
  status?: ShoppingStatus;
  url?: string | null;
  source_item_id?: number | null;
};

const SELECT_ALL = `
  SELECT s.*,
         cp.path AS category_path,
         lp.path AS location_path,
         v.name  AS vendor_name,
         CASE WHEN s.estimated_price IS NULL THEN NULL
              ELSE ROUND(s.estimated_price * s.desired_quantity, 2) END AS estimated_total
  FROM shopping_items s
  LEFT JOIN category_paths cp ON cp.id = s.category_id
  LEFT JOIN location_paths lp ON lp.id = s.location_id
  LEFT JOIN vendors v ON v.id = s.vendor_id
`;

const PRIORITY_ORDER = "CASE s.priority WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END";

function cleanName(name: unknown): string {
  const value = typeof name === 'string' ? name.trim() : '';
  if (!value) throw badRequest('Il nome dell’elemento da acquistare è obbligatorio');
  return value.slice(0, 200);
}

function checkEnum<T extends string>(value: unknown, allowed: readonly T[], field: string, fallback: T): T {
  if (value === undefined || value === null || value === '') return fallback;
  if (!allowed.includes(value as T)) throw badRequest(`Valore non valido per "${field}". Ammessi: ${allowed.join(', ')}`);
  return value as T;
}

export type ShoppingFilters = { status?: ShoppingStatus; priority?: Priority; category_id?: number; q?: string };

export function listShopping(filters: ShoppingFilters = {}, db: Db = getDb()): { items: ShoppingRow[]; estimated_total: number } {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (filters.status) {
    clauses.push('s.status = ?');
    params.push(filters.status);
  }
  if (filters.priority) {
    clauses.push('s.priority = ?');
    params.push(filters.priority);
  }
  if (filters.category_id !== undefined) {
    clauses.push('s.category_id = ?');
    params.push(filters.category_id);
  }
  if (filters.q?.trim()) {
    clauses.push('(s.name LIKE ? OR s.notes LIKE ?)');
    params.push(`%${filters.q.trim()}%`, `%${filters.q.trim()}%`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const items = db.all<ShoppingRow>(
    `${SELECT_ALL} ${where} ORDER BY ${PRIORITY_ORDER}, s.created_at DESC`,
    ...params,
  );
  const totals = db.get<{ total: number | null }>(
    `SELECT SUM(COALESCE(s.estimated_price, 0) * s.desired_quantity) AS total
     FROM shopping_items s ${where}`,
    ...params,
  );
  return { items, estimated_total: Math.round((totals?.total ?? 0) * 100) / 100 };
}

export function getShoppingItem(id: number, db: Db = getDb()): ShoppingRow {
  const row = db.get<ShoppingRow>(`${SELECT_ALL} WHERE s.id = ?`, id);
  if (!row) throw notFound('Elemento della lista acquisti', id);
  return row;
}

export function createShoppingItem(input: ShoppingInput, db: Db = getDb()): ShoppingRow {
  const res = db.run(
    `INSERT INTO shopping_items
       (name, notes, category_id, location_id, vendor_id, desired_quantity, unit,
        estimated_price, currency, priority, status, url, source_item_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    cleanName(input.name),
    input.notes ?? null,
    input.category_id ?? null,
    input.location_id ?? null,
    input.vendor_id ?? null,
    input.desired_quantity && input.desired_quantity > 0 ? input.desired_quantity : 1,
    input.unit?.trim() || getSetting('app.default_unit', 'pz', db),
    input.estimated_price ?? null,
    (input.currency ?? getSetting('app.default_currency', 'EUR', db)).toUpperCase(),
    checkEnum(input.priority, PRIORITIES, 'priority', 'media'),
    checkEnum(input.status, SHOPPING_STATUSES, 'status', 'da_comprare'),
    input.url ?? null,
    input.source_item_id ?? null,
  );
  return getShoppingItem(res.lastInsertRowid, db);
}

export function updateShoppingItem(id: number, input: Partial<ShoppingInput>, db: Db = getDb()): ShoppingRow {
  getShoppingItem(id, db);
  const sets: string[] = [];
  const params: Array<string | number | null> = [];
  const push = (column: string, value: string | number | null) => {
    sets.push(`${column} = ?`);
    params.push(value);
  };

  if (input.name !== undefined) push('name', cleanName(input.name));
  if (input.notes !== undefined) push('notes', input.notes);
  if (input.category_id !== undefined) push('category_id', input.category_id);
  if (input.location_id !== undefined) push('location_id', input.location_id);
  if (input.vendor_id !== undefined) push('vendor_id', input.vendor_id);
  if (input.desired_quantity !== undefined) {
    if (input.desired_quantity <= 0) throw badRequest('La quantità desiderata deve essere maggiore di zero');
    push('desired_quantity', input.desired_quantity);
  }
  if (input.unit !== undefined) push('unit', input.unit.trim() || 'pz');
  if (input.estimated_price !== undefined) push('estimated_price', input.estimated_price);
  if (input.currency !== undefined) push('currency', input.currency.toUpperCase());
  if (input.priority !== undefined) push('priority', checkEnum(input.priority, PRIORITIES, 'priority', 'media'));
  if (input.status !== undefined) {
    const status = checkEnum(input.status, SHOPPING_STATUSES, 'status', 'da_comprare');
    push('status', status);
    if (status === 'acquistato') push('purchased_at', todayIso());
  }
  if (input.url !== undefined) push('url', input.url);

  if (sets.length > 0) {
    push('updated_at', nowIso());
    db.run(`UPDATE shopping_items SET ${sets.join(', ')} WHERE id = ?`, ...params, id);
  }
  return getShoppingItem(id, db);
}

export function deleteShoppingItem(id: number, db: Db = getDb()): { deleted: number } {
  getShoppingItem(id, db);
  return { deleted: db.run('DELETE FROM shopping_items WHERE id = ?', id).changes };
}

export type ConvertOptions = {
  quantity?: number;
  purchase_price?: number | null;
  purchase_date?: string | null;
  location_id?: number | null;
  category_id?: number | null;
  vendor_id?: number | null;
  status_key?: string;
};

/**
 * "L'ho comprato": l'elemento della lista diventa un oggetto dell'inventario.
 * Il prezzo stimato viene proposto come prezzo di acquisto se non se ne indica
 * un altro; l'elemento resta in lista come "acquistato" e collegato all'oggetto.
 */
export function convertToItem(id: number, options: ConvertOptions = {}, db: Db = getDb()): { shopping: ShoppingRow; item: ItemView } {
  const shopping = getShoppingItem(id, db);
  if (shopping.item_id) throw conflict('Questo elemento è già stato convertito in un oggetto dell’inventario');

  return db.transaction(() => {
    const statusKey = options.status_key ?? 'owned';
    const status = getStatusByKey(statusKey, db);

    const item = createItem(
      {
        name: shopping.name,
        notes: shopping.notes,
        category_id: options.category_id ?? shopping.category_id,
        location_id: options.location_id ?? shopping.location_id,
        vendor_id: options.vendor_id ?? shopping.vendor_id,
        status_id: status?.id ?? null,
        quantity: options.quantity ?? shopping.desired_quantity,
        unit: shopping.unit,
        purchase_price: options.purchase_price !== undefined ? options.purchase_price : shopping.estimated_price,
        currency: shopping.currency,
        purchase_date: options.purchase_date ?? todayIso(),
        product_url: shopping.url,
      },
      db,
    );

    db.run(
      'UPDATE shopping_items SET status = ?, item_id = ?, purchased_at = ?, updated_at = ? WHERE id = ?',
      'acquistato',
      item.id,
      todayIso(),
      nowIso(),
      id,
    );
    recordEvent(item.id, 'purchased', { note: `creato dalla lista acquisti (#${id})` }, db);

    // Se nasceva dal riordino di un consumabile, il magazzino si ricarica.
    if (shopping.source_item_id) {
      const source = db.get<{ quantity: number }>('SELECT quantity FROM items WHERE id = ?', shopping.source_item_id);
      if (source) {
        const next = source.quantity + (options.quantity ?? shopping.desired_quantity);
        db.run('UPDATE items SET quantity = ?, updated_at = ? WHERE id = ?', next, nowIso(), shopping.source_item_id);
        recordEvent(shopping.source_item_id, 'quantity', { field: 'quantity', old: source.quantity, new: next, note: 'riacquisto' }, db);
      }
    }

    return { shopping: getShoppingItem(id, db), item };
  });
}

/** "Da ricomprare": crea la voce in lista partendo da un consumabile esaurito. */
export function restockFromItem(itemId: number, db: Db = getDb()): ShoppingRow {
  const item = db.get<{ id: number; name: string; category_id: number | null; location_id: number | null; unit: string; purchase_price: number | null; currency: string; vendor_id: number | null; min_quantity: number | null; quantity: number }>(
    'SELECT id, name, category_id, location_id, unit, purchase_price, currency, vendor_id, min_quantity, quantity FROM items WHERE id = ? AND deleted_at IS NULL',
    itemId,
  );
  if (!item) throw notFound('Oggetto', itemId);

  const existing = db.get<{ id: number }>(
    "SELECT id FROM shopping_items WHERE source_item_id = ? AND status IN ('da_comprare','ordinato')",
    itemId,
  );
  if (existing) return getShoppingItem(existing.id, db);

  const needed = item.min_quantity !== null ? Math.max(1, item.min_quantity - item.quantity + 1) : 1;
  return createShoppingItem(
    {
      name: item.name,
      category_id: item.category_id,
      location_id: item.location_id,
      vendor_id: item.vendor_id,
      desired_quantity: needed,
      unit: item.unit,
      estimated_price: item.purchase_price,
      currency: item.currency,
      priority: 'media',
      source_item_id: itemId,
    },
    db,
  );
}

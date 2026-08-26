/**
 * Logica di dominio degli oggetti: validazione, campi derivati, cronologia.
 * Nessuna dipendenza da HTTP: queste funzioni sono usate dalle route, dalla CLI
 * e dall'import.
 */
import type { Db } from '../db/connection.ts';
import { getDb } from '../db/connection.ts';
import { badRequest, notFound } from '../core/errors.ts';
import { addMonths, isDateString, nowIso } from '../core/dates.ts';
import { newUid } from '../core/ids.ts';
import { getNumericSetting, getSetting } from './settings.service.ts';
import { defaultStatus, getStatus, getStatusByKey } from './statuses.service.ts';
import { resolveTagIds, setItemTags, addItemTags } from './tags.service.ts';
import { resolveVendorId } from './vendors.service.ts';
import { findItemRow, findItemRowByUid, findItems, toItemView } from './items.repository.ts';
import type { ItemFilters, ItemInput, ItemListResult, ItemView } from './items.types.ts';

/** Campi la cui modifica viene annotata nella cronologia dell'oggetto. */
const TRACKED_FIELDS = [
  'name',
  'quantity',
  'status_id',
  'location_id',
  'category_id',
  'purchase_price',
  'warranty_end',
  'expiration_date',
  'min_quantity',
] as const;

type ViewOptions = { warrantyDays: number; expirationDays: number };

function viewOptions(db: Db): ViewOptions {
  return {
    warrantyDays: getNumericSetting('alerts.warranty_days', 60, db),
    expirationDays: getNumericSetting('alerts.expiration_days', 30, db),
  };
}

export function recordEvent(
  itemId: number,
  eventType: string,
  detail: { field?: string; old?: unknown; new?: unknown; note?: string } = {},
  db: Db = getDb(),
): void {
  db.run(
    'INSERT INTO item_events (item_id, event_type, field, old_value, new_value, note) VALUES (?, ?, ?, ?, ?, ?)',
    itemId,
    eventType,
    detail.field ?? null,
    detail.old === undefined || detail.old === null ? null : String(detail.old),
    detail.new === undefined || detail.new === null ? null : String(detail.new),
    detail.note ?? null,
  );
}

function cleanName(name: unknown): string {
  const value = typeof name === 'string' ? name.trim() : '';
  if (!value) throw badRequest('Il nome dell’oggetto è obbligatorio');
  if (value.length > 200) throw badRequest('Il nome dell’oggetto è troppo lungo (max 200 caratteri)');
  return value;
}

function checkDate(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (!isDateString(value)) throw badRequest(`Data non valida in "${field}": attesa nel formato AAAA-MM-GG`);
  return value;
}

function checkNumber(value: unknown, field: string, { min = 0 }: { min?: number } = {}): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(n)) throw badRequest(`Valore numerico non valido in "${field}"`);
  if (n < min) throw badRequest(`Il campo "${field}" non può essere minore di ${min}`);
  return n;
}

function assertReference(db: Db, table: 'categories' | 'locations' | 'vendors', id: number | null | undefined, label: string): number | null {
  if (id === null || id === undefined) return null;
  const row = db.get(`SELECT 1 FROM ${table} WHERE id = ?`, id);
  if (!row) throw notFound(label, id);
  return id;
}

/** Se manca la data di fine garanzia ma ci sono durata e inizio, la calcola. */
function deriveWarrantyEnd(input: {
  warranty_end?: string | null;
  warranty_months?: number | null;
  warranty_start?: string | null;
  purchase_date?: string | null;
}): string | null {
  if (input.warranty_end) return input.warranty_end;
  const start = input.warranty_start ?? input.purchase_date ?? null;
  if (!start || !input.warranty_months) return null;
  return addMonths(start, input.warranty_months);
}

function resolveStatusId(input: ItemInput, db: Db): number {
  if (input.status_id !== undefined && input.status_id !== null) return getStatus(input.status_id, db).id;
  if (input.status_key) {
    const status = getStatusByKey(input.status_key, db);
    if (!status) throw notFound('Stato', input.status_key);
    return status.id;
  }
  return defaultStatus(db).id;
}

export function getItem(id: number, db: Db = getDb()): ItemView {
  const row = findItemRow(id, db);
  if (!row) throw notFound('Oggetto', id);
  return toItemView(row, viewOptions(db));
}

export function getItemByUid(uid: string, db: Db = getDb()): ItemView {
  const row = findItemRowByUid(uid, db);
  if (!row) throw notFound('Oggetto', uid);
  return toItemView(row, viewOptions(db));
}

export function listItems(filters: ItemFilters, db: Db = getDb()): ItemListResult {
  const { rows, total, total_value } = findItems(filters, db);
  const opts = viewOptions(db);
  return {
    items: rows.map((row) => toItemView(row, opts)),
    total,
    total_value: Math.round(total_value * 100) / 100,
    limit: Math.min(Math.max(filters.limit ?? 50, 1), 500),
    offset: Math.max(filters.offset ?? 0, 0),
  };
}

export function createItem(input: ItemInput, db: Db = getDb()): ItemView {
  const name = cleanName(input.name);

  return db.transaction(() => {
    const categoryId = assertReference(db, 'categories', input.category_id, 'Categoria');
    const locationId = assertReference(db, 'locations', input.location_id, 'Posizione');
    const statusId = resolveStatusId(input, db);
    const vendorId = input.vendor_id !== undefined && input.vendor_id !== null
      ? assertReference(db, 'vendors', input.vendor_id, 'Negozio')
      : resolveVendorId(input.vendor_name, db);

    const purchaseDate = checkDate(input.purchase_date, 'purchase_date');
    const warrantyStart = checkDate(input.warranty_start, 'warranty_start');
    const warrantyEnd = deriveWarrantyEnd({
      warranty_end: checkDate(input.warranty_end, 'warranty_end'),
      warranty_months: input.warranty_months ?? null,
      warranty_start: warrantyStart,
      purchase_date: purchaseDate,
    });

    const quantity = checkNumber(input.quantity ?? 1, 'quantity') ?? 1;
    const uid = input.uid && input.uid.trim() ? input.uid.trim() : newUid();

    const res = db.run(
      `INSERT INTO items (
         uid, name, description, category_id, location_id, status_id, vendor_id,
         quantity, unit, is_consumable, min_quantity, initial_quantity,
         brand, model, serial_number, sku, barcode,
         purchase_price, current_value, currency, purchase_date, product_url,
         warranty_months, warranty_start, warranty_end, warranty_notes,
         expiration_date, expected_lifespan_months, notes, specs, is_favorite
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      uid,
      name,
      input.description ?? null,
      categoryId,
      locationId,
      statusId,
      vendorId,
      quantity,
      (input.unit ?? getSetting('app.default_unit', 'pz', db)).trim() || 'pz',
      input.is_consumable ?? false,
      checkNumber(input.min_quantity, 'min_quantity'),
      checkNumber(input.initial_quantity, 'initial_quantity') ?? (input.is_consumable ? quantity : null),
      input.brand ?? null,
      input.model ?? null,
      input.serial_number ?? null,
      input.sku ?? null,
      input.barcode ?? null,
      checkNumber(input.purchase_price, 'purchase_price'),
      checkNumber(input.current_value, 'current_value'),
      (input.currency ?? getSetting('app.default_currency', 'EUR', db)).toUpperCase(),
      purchaseDate,
      input.product_url ?? null,
      checkNumber(input.warranty_months, 'warranty_months'),
      warrantyStart,
      warrantyEnd,
      input.warranty_notes ?? null,
      checkDate(input.expiration_date, 'expiration_date'),
      checkNumber(input.expected_lifespan_months, 'expected_lifespan_months'),
      input.notes ?? null,
      input.specs ? JSON.stringify(input.specs) : null,
      input.is_favorite ?? false,
    );

    const itemId = res.lastInsertRowid;
    const tagIds = [...(input.tag_ids ?? []), ...resolveTagIds(input.tags ?? [], db)];
    if (tagIds.length) setItemTags(itemId, tagIds, db);

    recordEvent(itemId, 'created', { note: name }, db);
    return getItem(itemId, db);
  });
}

export function updateItem(id: number, input: Partial<ItemInput>, db: Db = getDb()): ItemView {
  const current = db.get<Record<string, unknown>>('SELECT * FROM items WHERE id = ?', id);
  if (!current) throw notFound('Oggetto', id);

  return db.transaction(() => {
    const sets: string[] = [];
    const params: Array<string | number | null> = [];
    const push = (column: string, value: string | number | null) => {
      sets.push(`${column} = ?`);
      params.push(value);
    };

    if (input.name !== undefined) push('name', cleanName(input.name));
    if (input.description !== undefined) push('description', input.description);
    if (input.category_id !== undefined) push('category_id', assertReference(db, 'categories', input.category_id, 'Categoria'));
    if (input.location_id !== undefined) push('location_id', assertReference(db, 'locations', input.location_id, 'Posizione'));
    if (input.status_id !== undefined || input.status_key !== undefined) {
      push('status_id', resolveStatusId(input as ItemInput, db));
    }
    if (input.vendor_id !== undefined) push('vendor_id', assertReference(db, 'vendors', input.vendor_id, 'Negozio'));
    else if (input.vendor_name !== undefined) push('vendor_id', resolveVendorId(input.vendor_name, db));

    if (input.quantity !== undefined) push('quantity', checkNumber(input.quantity, 'quantity') ?? 0);
    if (input.unit !== undefined) push('unit', input.unit.trim() || 'pz');
    if (input.is_consumable !== undefined) push('is_consumable', input.is_consumable ? 1 : 0);
    if (input.min_quantity !== undefined) push('min_quantity', checkNumber(input.min_quantity, 'min_quantity'));
    if (input.initial_quantity !== undefined) push('initial_quantity', checkNumber(input.initial_quantity, 'initial_quantity'));
    if (input.brand !== undefined) push('brand', input.brand);
    if (input.model !== undefined) push('model', input.model);
    if (input.serial_number !== undefined) push('serial_number', input.serial_number);
    if (input.sku !== undefined) push('sku', input.sku);
    if (input.barcode !== undefined) push('barcode', input.barcode);
    if (input.purchase_price !== undefined) push('purchase_price', checkNumber(input.purchase_price, 'purchase_price'));
    if (input.current_value !== undefined) push('current_value', checkNumber(input.current_value, 'current_value'));
    if (input.currency !== undefined) push('currency', input.currency.toUpperCase());
    if (input.purchase_date !== undefined) push('purchase_date', checkDate(input.purchase_date, 'purchase_date'));
    if (input.product_url !== undefined) push('product_url', input.product_url);
    if (input.warranty_months !== undefined) push('warranty_months', checkNumber(input.warranty_months, 'warranty_months'));
    if (input.warranty_start !== undefined) push('warranty_start', checkDate(input.warranty_start, 'warranty_start'));
    if (input.warranty_notes !== undefined) push('warranty_notes', input.warranty_notes);
    if (input.expiration_date !== undefined) push('expiration_date', checkDate(input.expiration_date, 'expiration_date'));
    if (input.expected_lifespan_months !== undefined) {
      push('expected_lifespan_months', checkNumber(input.expected_lifespan_months, 'expected_lifespan_months'));
    }
    if (input.notes !== undefined) push('notes', input.notes);
    if (input.specs !== undefined) push('specs', input.specs ? JSON.stringify(input.specs) : null);
    if (input.is_favorite !== undefined) push('is_favorite', input.is_favorite ? 1 : 0);

    // La fine garanzia esplicita vince; altrimenti si ricalcola se sono
    // cambiati gli ingredienti (durata, inizio, data di acquisto).
    if (input.warranty_end !== undefined) {
      push('warranty_end', checkDate(input.warranty_end, 'warranty_end'));
    } else if (
      input.warranty_months !== undefined ||
      input.warranty_start !== undefined ||
      input.purchase_date !== undefined
    ) {
      const months = (input.warranty_months ?? current.warranty_months) as number | null;
      const start = (input.warranty_start ?? current.warranty_start) as string | null;
      const purchase = (input.purchase_date ?? current.purchase_date) as string | null;
      push('warranty_end', deriveWarrantyEnd({ warranty_months: months, warranty_start: start, purchase_date: purchase }));
    }

    if (sets.length > 0) {
      push('updated_at', nowIso());
      db.run(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`, ...params, id);
    }

    if (input.tag_ids !== undefined || input.tags !== undefined) {
      const tagIds = [...(input.tag_ids ?? []), ...resolveTagIds(input.tags ?? [], db)];
      setItemTags(id, tagIds, db);
    }

    // Cronologia: una riga per campo rilevante effettivamente cambiato.
    const after = db.get<Record<string, unknown>>('SELECT * FROM items WHERE id = ?', id);
    for (const field of TRACKED_FIELDS) {
      const before = current[field] ?? null;
      const now = after?.[field] ?? null;
      if (String(before) === String(now)) continue;
      const type = field === 'quantity' ? 'quantity' : field === 'location_id' ? 'moved' : field === 'status_id' ? 'status' : 'updated';
      recordEvent(id, type, { field, old: before, new: now }, db);
    }

    return getItem(id, db);
  });
}

/** Variazione rapida di quantita' (+1 / -1 dalle liste). */
export function adjustQuantity(id: number, delta: number, db: Db = getDb()): ItemView {
  const current = db.get<{ quantity: number }>('SELECT quantity FROM items WHERE id = ?', id);
  if (!current) throw notFound('Oggetto', id);
  const next = Math.max(0, Math.round((current.quantity + delta) * 1000) / 1000);
  db.transaction(() => {
    db.run('UPDATE items SET quantity = ?, updated_at = ? WHERE id = ?', next, nowIso(), id);
    recordEvent(id, 'quantity', { field: 'quantity', old: current.quantity, new: next }, db);
  });
  return getItem(id, db);
}

export function setQuantity(id: number, quantity: number, db: Db = getDb()): ItemView {
  const value = checkNumber(quantity, 'quantity') ?? 0;
  return updateItem(id, { quantity: value }, db);
}

/** Cestino: l'oggetto sparisce dalle viste ma resta ripristinabile. */
export function softDeleteItem(id: number, db: Db = getDb()): { id: number; deleted_at: string } {
  const row = db.get<{ id: number; name: string }>('SELECT id, name FROM items WHERE id = ? AND deleted_at IS NULL', id);
  if (!row) throw notFound('Oggetto', id);
  const deletedAt = nowIso();
  db.transaction(() => {
    db.run('UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?', deletedAt, deletedAt, id);
    recordEvent(id, 'deleted', { note: row.name }, db);
  });
  return { id, deleted_at: deletedAt };
}

export function restoreItem(id: number, db: Db = getDb()): ItemView {
  const row = db.get<{ id: number }>('SELECT id FROM items WHERE id = ? AND deleted_at IS NOT NULL', id);
  if (!row) throw notFound('Oggetto nel cestino', id);
  db.transaction(() => {
    db.run('UPDATE items SET deleted_at = NULL, updated_at = ? WHERE id = ?', nowIso(), id);
    recordEvent(id, 'restored', {}, db);
  });
  return getItem(id, db);
}

/**
 * Cancellazione definitiva. Gli allegati logici vengono rimossi, ma i file
 * fisici NO: restano finche' non sono orfani, e li rimuove la garbage
 * collection (docs/BACKUP.md). Cosi' una ricevuta condivisa fra due oggetti non
 * sparisce cancellandone uno solo.
 */
export function purgeItem(id: number, db: Db = getDb()): { deleted: number; attachments_removed: number } {
  const row = db.get<{ id: number }>('SELECT id FROM items WHERE id = ?', id);
  if (!row) throw notFound('Oggetto', id);
  return db.transaction(() => {
    const attachments = db.run("DELETE FROM attachments WHERE entity_type = 'item' AND entity_id = ?", id);
    const deleted = db.run('DELETE FROM items WHERE id = ?', id);
    return { deleted: deleted.changes, attachments_removed: attachments.changes };
  });
}

export function emptyTrash(db: Db = getDb()): { deleted: number } {
  const ids = db.all<{ id: number }>('SELECT id FROM items WHERE deleted_at IS NOT NULL').map((r) => r.id);
  let deleted = 0;
  db.transaction(() => {
    for (const id of ids) deleted += purgeItem(id, db).deleted;
  });
  return { deleted };
}

/** Duplica un oggetto (tag inclusi, allegati esclusi: sono documenti dell'originale). */
export function duplicateItem(id: number, db: Db = getDb()): ItemView {
  const source = getItem(id, db);
  return createItem(
    {
      name: `${source.name} (copia)`,
      description: source.description,
      category_id: source.category?.id ?? null,
      location_id: source.location?.id ?? null,
      status_id: source.status.id,
      vendor_id: source.vendor?.id ?? null,
      quantity: source.quantity,
      unit: source.unit,
      is_consumable: source.is_consumable,
      min_quantity: source.min_quantity,
      brand: source.brand,
      model: source.model,
      sku: source.sku,
      purchase_price: source.purchase_price,
      currency: source.currency,
      purchase_date: source.purchase_date,
      product_url: source.product_url,
      warranty_months: source.warranty.months,
      notes: source.notes,
      specs: source.specs,
      tag_ids: source.tags.map((t) => t.id),
    },
    db,
  );
}

export type BulkAction =
  | { action: 'move'; location_id: number | null }
  | { action: 'categorize'; category_id: number | null }
  | { action: 'status'; status_id: number }
  | { action: 'add_tags'; tag_ids?: number[]; tags?: string[] }
  | { action: 'delete' }
  | { action: 'restore' }
  | { action: 'favorite'; value: boolean };

/** Azioni multiple: selezione di N oggetti -> una sola operazione. */
export function bulkAction(ids: number[], action: BulkAction, db: Db = getDb()): { affected: number } {
  if (!ids.length) throw badRequest('Nessun oggetto selezionato');
  return db.transaction(() => {
    let affected = 0;
    for (const id of ids) {
      switch (action.action) {
        case 'move':
          updateItem(id, { location_id: action.location_id }, db);
          break;
        case 'categorize':
          updateItem(id, { category_id: action.category_id }, db);
          break;
        case 'status':
          updateItem(id, { status_id: action.status_id }, db);
          break;
        case 'favorite':
          updateItem(id, { is_favorite: action.value }, db);
          break;
        case 'add_tags': {
          const tagIds = [...(action.tag_ids ?? []), ...resolveTagIds(action.tags ?? [], db)];
          addItemTags(id, tagIds, db);
          break;
        }
        case 'delete':
          softDeleteItem(id, db);
          break;
        case 'restore':
          restoreItem(id, db);
          break;
      }
      affected++;
    }
    return { affected };
  });
}

export type ItemEvent = {
  id: number;
  item_id: number;
  event_type: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
  occurred_at: string;
};

export function itemHistory(id: number, limit = 100, db: Db = getDb()): ItemEvent[] {
  return db.all<ItemEvent>(
    'SELECT * FROM item_events WHERE item_id = ? ORDER BY occurred_at DESC, id DESC LIMIT ?',
    id,
    Math.min(Math.max(limit, 1), 500),
  );
}

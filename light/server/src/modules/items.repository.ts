/**
 * Accesso al database per gli oggetti: qui vive TUTTO l'SQL dell'inventario.
 * Il service sopra non scrive query, le route non sanno che esiste SQLite.
 */
import type { Db, SqlParam } from '../db/connection.ts';
import { getDb } from '../db/connection.ts';
import { descendantIds } from '../db/tree.ts';
import { todayIso, daysBetween } from '../core/dates.ts';
import type {
  ExpirationStatus,
  ItemFilters,
  ItemJoinedRow,
  ItemView,
  TagRef,
  WarrantyStatus,
} from './items.types.ts';

const SELECT_COLUMNS = `
  i.*,
  c.name  AS category_name,
  cp.path AS category_path,
  l.name  AS location_name,
  lp.path AS location_path,
  l.kind  AS location_kind,
  lp.room_id, lp.room_name,
  s.key AS status_key, s.label AS status_label, s.color AS status_color,
  s.counts_as_owned, s.is_wishlist,
  v.name AS vendor_name,
  (SELECT COUNT(*) FROM attachments a WHERE a.entity_type = 'item' AND a.entity_id = i.id) AS attachment_count,
  (SELECT COUNT(*) FROM attachments a WHERE a.entity_type = 'item' AND a.entity_id = i.id AND a.kind = 'photo') AS photo_count,
  (SELECT COUNT(*) FROM attachments a WHERE a.entity_type = 'item' AND a.entity_id = i.id AND a.kind <> 'photo') AS document_count,
  (SELECT a.id FROM attachments a
     WHERE a.entity_type = 'item' AND a.entity_id = i.id AND a.kind = 'photo'
     ORDER BY a.is_primary DESC, a.sort_order, a.id LIMIT 1) AS primary_photo_id,
  (SELECT json_group_array(json_object('id', t.id, 'name', t.name, 'color', t.color))
     FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE it.item_id = i.id) AS tags_json
`;

const FROM_JOINS = `
  FROM items i
  LEFT JOIN categories c      ON c.id  = i.category_id
  LEFT JOIN category_paths cp ON cp.id = i.category_id
  LEFT JOIN locations l       ON l.id  = i.location_id
  LEFT JOIN location_paths lp ON lp.id = i.location_id
  JOIN item_statuses s        ON s.id  = i.status_id
  LEFT JOIN vendors v         ON v.id  = i.vendor_id
`;

/**
 * Traduce il testo digitato dall'utente in una query FTS5 valida.
 * Ogni parola diventa un prefisso fra virgolette: "tras"* trova "trasloco".
 * Le virgolette evitano che i caratteri speciali di FTS5 (-, *, :, NEAR) siano
 * interpretati come sintassi e facciano fallire la ricerca.
 */
export function toFtsQuery(input: string): string | null {
  const tokens = input
    .replace(/["*()]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `"${t}"*`).join(' AND ');
}

type Where = { sql: string; params: SqlParam[] };

export function buildWhere(filters: ItemFilters, db: Db): Where {
  const clauses: string[] = [];
  const params: SqlParam[] = [];
  const today = todayIso();

  switch (filters.trash ?? 'exclude') {
    case 'only':
      clauses.push('i.deleted_at IS NOT NULL');
      break;
    case 'include':
      break;
    default:
      clauses.push('i.deleted_at IS NULL');
  }

  if (filters.q && filters.q.trim()) {
    const raw = filters.q.trim();
    const fts = toFtsQuery(raw);
    const like = `%${raw.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    // Full-text sui campi dell'oggetto OPPURE testo dei riferimenti collegati
    // (categoria, posizione, tag, negozio), che nell'indice FTS non ci sono.
    const parts: string[] = [];
    if (fts) {
      parts.push('i.id IN (SELECT rowid FROM items_fts WHERE items_fts MATCH ?)');
      params.push(fts);
    }
    parts.push(`(
      cp.path LIKE ? ESCAPE '\\' OR lp.path LIKE ? ESCAPE '\\' OR v.name LIKE ? ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM item_tags it JOIN tags t ON t.id = it.tag_id
                 WHERE it.item_id = i.id AND t.name LIKE ? ESCAPE '\\')
    )`);
    params.push(like, like, like, like);
    clauses.push(`(${parts.join(' OR ')})`);
  }

  if (filters.category_id !== undefined) {
    const ids = filters.include_subcategories === false ? [filters.category_id] : descendantIds(db, 'categories', filters.category_id);
    clauses.push(`i.category_id IN (${ids.map(() => '?').join(',')})`);
    params.push(...ids);
  }
  if (filters.no_category) clauses.push('i.category_id IS NULL');

  if (filters.location_id !== undefined) {
    const ids = filters.include_sublocations === false ? [filters.location_id] : descendantIds(db, 'locations', filters.location_id);
    clauses.push(`i.location_id IN (${ids.map(() => '?').join(',')})`);
    params.push(...ids);
  }
  if (filters.no_location) clauses.push('i.location_id IS NULL');
  if (filters.room_id !== undefined) {
    clauses.push('lp.room_id = ?');
    params.push(filters.room_id);
  }

  if (filters.status_ids?.length) {
    clauses.push(`i.status_id IN (${filters.status_ids.map(() => '?').join(',')})`);
    params.push(...filters.status_ids);
  }
  if (filters.owned_only) clauses.push('s.counts_as_owned = 1');
  if (filters.wishlist_only) clauses.push('s.is_wishlist = 1');

  if (filters.tag_ids?.length) {
    if ((filters.tags_mode ?? 'any') === 'all') {
      clauses.push(
        `(SELECT COUNT(DISTINCT it.tag_id) FROM item_tags it
           WHERE it.item_id = i.id AND it.tag_id IN (${filters.tag_ids.map(() => '?').join(',')})) = ?`,
      );
      params.push(...filters.tag_ids, filters.tag_ids.length);
    } else {
      clauses.push(
        `EXISTS (SELECT 1 FROM item_tags it WHERE it.item_id = i.id
                 AND it.tag_id IN (${filters.tag_ids.map(() => '?').join(',')}))`,
      );
      params.push(...filters.tag_ids);
    }
  }

  if (filters.vendor_id !== undefined) {
    clauses.push('i.vendor_id = ?');
    params.push(filters.vendor_id);
  }
  if (filters.brand) {
    clauses.push('i.brand LIKE ?');
    params.push(`%${filters.brand}%`);
  }
  if (filters.price_min !== undefined) {
    clauses.push('i.purchase_price >= ?');
    params.push(filters.price_min);
  }
  if (filters.price_max !== undefined) {
    clauses.push('i.purchase_price <= ?');
    params.push(filters.price_max);
  }
  if (filters.purchased_from) {
    clauses.push('i.purchase_date >= ?');
    params.push(filters.purchased_from);
  }
  if (filters.purchased_to) {
    clauses.push('i.purchase_date <= ?');
    params.push(filters.purchased_to);
  }
  if (filters.is_consumable !== undefined) {
    clauses.push('i.is_consumable = ?');
    params.push(filters.is_consumable ? 1 : 0);
  }
  if (filters.below_min) {
    clauses.push('i.min_quantity IS NOT NULL AND i.quantity <= i.min_quantity');
  }
  if (filters.is_favorite) clauses.push('i.is_favorite = 1');
  if (filters.has_attachments) {
    clauses.push("EXISTS (SELECT 1 FROM attachments a WHERE a.entity_type = 'item' AND a.entity_id = i.id)");
  }

  if (filters.warranty && filters.warranty !== 'none') {
    if (filters.warranty === 'expired') {
      clauses.push('i.warranty_end IS NOT NULL AND i.warranty_end < ?');
      params.push(today);
    } else if (filters.warranty === 'active') {
      clauses.push('i.warranty_end IS NOT NULL AND i.warranty_end >= ?');
      params.push(today);
    } else {
      clauses.push('i.warranty_end IS NOT NULL AND i.warranty_end >= ? AND i.warranty_end <= date(?, ?)');
      params.push(today, today, `+${filters.expiring_within_days ?? 60} days`);
    }
  } else if (filters.warranty === 'none') {
    clauses.push('i.warranty_end IS NULL');
  }

  if (filters.expired) {
    clauses.push('i.expiration_date IS NOT NULL AND i.expiration_date < ?');
    params.push(today);
  } else if (filters.expiring_within_days !== undefined && !filters.warranty) {
    clauses.push('i.expiration_date IS NOT NULL AND i.expiration_date <= date(?, ?)');
    params.push(today, `+${filters.expiring_within_days} days`);
  }

  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

const SORT_SQL: Record<string, string> = {
  name: 'i.name COLLATE NOCASE',
  created_at: 'i.created_at',
  updated_at: 'i.updated_at',
  purchase_date: 'i.purchase_date',
  purchase_price: 'i.purchase_price',
  quantity: 'i.quantity',
  category: 'cp.path COLLATE NOCASE',
  location: 'lp.path COLLATE NOCASE',
  status: 's.sort_order',
  relevance: 'i.updated_at',
};

export function findItems(filters: ItemFilters, db: Db = getDb()): { rows: ItemJoinedRow[]; total: number; total_value: number } {
  const where = buildWhere(filters, db);
  const sortKey = filters.sort && SORT_SQL[filters.sort] ? filters.sort : 'updated_at';
  const direction = filters.direction === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 500);
  const offset = Math.max(filters.offset ?? 0, 0);

  // NULLS LAST anche in SQLite: le date/prezzi mancanti finiscono in fondo.
  const orderColumn = SORT_SQL[sortKey] as string;
  const orderBy = `ORDER BY (${orderColumn}) IS NULL, ${orderColumn} ${direction}, i.id DESC`;

  const rows = db.all<ItemJoinedRow>(
    `SELECT ${SELECT_COLUMNS} ${FROM_JOINS} ${where.sql} ${orderBy} LIMIT ? OFFSET ?`,
    ...where.params,
    limit,
    offset,
  );

  const totals = db.get<{ total: number; total_value: number | null }>(
    `SELECT COUNT(*) AS total,
            SUM(COALESCE(i.purchase_price, 0) * i.quantity) AS total_value
     ${FROM_JOINS} ${where.sql}`,
    ...where.params,
  );

  return { rows, total: totals?.total ?? 0, total_value: totals?.total_value ?? 0 };
}

export function findItemRow(id: number, db: Db = getDb()): ItemJoinedRow | undefined {
  return db.get<ItemJoinedRow>(`SELECT ${SELECT_COLUMNS} ${FROM_JOINS} WHERE i.id = ?`, id);
}

export function findItemRowByUid(uid: string, db: Db = getDb()): ItemJoinedRow | undefined {
  return db.get<ItemJoinedRow>(`SELECT ${SELECT_COLUMNS} ${FROM_JOINS} WHERE i.uid = ?`, uid);
}

export function warrantyStatusOf(end: string | null, warningDays: number, today = todayIso()): { status: WarrantyStatus; daysLeft: number | null } {
  if (!end) return { status: 'none', daysLeft: null };
  const daysLeft = daysBetween(today, end);
  if (daysLeft < 0) return { status: 'expired', daysLeft };
  if (daysLeft <= warningDays) return { status: 'expiring', daysLeft };
  return { status: 'active', daysLeft };
}

export function expirationStatusOf(date: string | null, warningDays: number, today = todayIso()): { status: ExpirationStatus; daysLeft: number | null } {
  if (!date) return { status: 'none', daysLeft: null };
  const daysLeft = daysBetween(today, date);
  if (daysLeft < 0) return { status: 'expired', daysLeft };
  if (daysLeft <= warningDays) return { status: 'expiring', daysLeft };
  return { status: 'ok', daysLeft };
}

function parseTags(json: string | null): TagRef[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as TagRef[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseSpecs(json: string | null): Record<string, string> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
    }
  } catch {
    /* specs corrotte non devono rompere la lettura dell'oggetto */
  }
  return {};
}

/** Converte la riga SQL nella rappresentazione usata da API e interfaccia. */
export function toItemView(row: ItemJoinedRow, opts: { warrantyDays: number; expirationDays: number }): ItemView {
  const warranty = warrantyStatusOf(row.warranty_end, opts.warrantyDays);
  const expiration = expirationStatusOf(row.expiration_date, opts.expirationDays);

  return {
    id: row.id,
    uid: row.uid,
    name: row.name,
    description: row.description,
    category:
      row.category_id === null
        ? null
        : { id: row.category_id, name: row.category_name ?? '', path: row.category_path ?? row.category_name ?? '' },
    location:
      row.location_id === null
        ? null
        : {
            id: row.location_id,
            name: row.location_name ?? '',
            path: row.location_path ?? row.location_name ?? '',
            kind: row.location_kind ?? 'other',
            room_id: row.room_id,
            room_name: row.room_name,
          },
    status: {
      id: row.status_id,
      key: row.status_key,
      label: row.status_label,
      color: row.status_color,
      counts_as_owned: row.counts_as_owned === 1,
      is_wishlist: row.is_wishlist === 1,
    },
    vendor: row.vendor_id === null ? null : { id: row.vendor_id, name: row.vendor_name ?? '' },
    quantity: row.quantity,
    unit: row.unit,
    is_consumable: row.is_consumable === 1,
    min_quantity: row.min_quantity,
    initial_quantity: row.initial_quantity,
    below_min: row.min_quantity !== null && row.quantity <= row.min_quantity,
    brand: row.brand,
    model: row.model,
    serial_number: row.serial_number,
    sku: row.sku,
    barcode: row.barcode,
    purchase_price: row.purchase_price,
    current_value: row.current_value,
    currency: row.currency,
    total_value: row.purchase_price === null ? null : Math.round(row.purchase_price * row.quantity * 100) / 100,
    purchase_date: row.purchase_date,
    product_url: row.product_url,
    warranty: {
      months: row.warranty_months,
      start: row.warranty_start,
      end: row.warranty_end,
      notes: row.warranty_notes,
      status: warranty.status,
      days_left: warranty.daysLeft,
    },
    expiration_date: row.expiration_date,
    expiration_status: expiration.status,
    expiration_days_left: expiration.daysLeft,
    expected_lifespan_months: row.expected_lifespan_months,
    notes: row.notes,
    specs: parseSpecs(row.specs),
    is_favorite: row.is_favorite === 1,
    tags: parseTags(row.tags_json),
    attachment_count: row.attachment_count,
    photo_count: row.photo_count,
    document_count: row.document_count,
    primary_photo_id: row.primary_photo_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
  };
}

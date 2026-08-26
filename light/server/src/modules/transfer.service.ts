/**
 * Import / export.
 *
 * Obiettivo dichiarato del progetto: nessun lock-in. I dati devono poter uscire
 * in un formato leggibile senza questa applicazione, e rientrare senza creare
 * duplicati.
 *
 * - JSON: esportazione completa e reversibile (tutte le entita' + i metadati
 *   degli allegati). E' il formato di riferimento per un ripristino logico.
 * - CSV : una riga per oggetto, colonne piatte e leggibili in Excel/LibreOffice.
 *   Categorie e posizioni sono espresse come percorso ("Casa / Cucina / Cassetto 2")
 *   e vengono ricreate in import se mancano.
 *
 * Chiave di merge in import: `uid` per gli oggetti, il percorso per categorie e
 * posizioni, il nome per tag e negozi, la chiave per gli stati. Reimportare lo
 * stesso file due volte non duplica nulla.
 */
import type { Db } from '../db/connection.ts';
import { getDb } from '../db/connection.ts';
import { parseCsv, toCsv } from '../core/csv.ts';
import { badRequest } from '../core/errors.ts';
import { nowIso } from '../core/dates.ts';
import { createLogger } from '../core/logger.ts';
import { schemaVersion } from '../db/migrator.ts';
import { createItem, updateItem } from './items.service.ts';
import { getAllSettings } from './settings.service.ts';
import { resolveTagIds } from './tags.service.ts';

const log = createLogger('transfer');

export const EXPORT_FORMAT_VERSION = 1;

export type ExportBundle = {
  meta: {
    app: string;
    format_version: number;
    schema_version: number;
    exported_at: string;
    counts: Record<string, number>;
  };
  settings: Record<string, string>;
  statuses: unknown[];
  categories: unknown[];
  locations: unknown[];
  vendors: unknown[];
  tags: unknown[];
  items: unknown[];
  item_tags: unknown[];
  shopping_items: unknown[];
  attachments: unknown[];
  files: unknown[];
  maintenance_records: unknown[];
  item_events: unknown[];
};

/** Esportazione completa in JSON: tutto cio' che sta nel database. */
export function exportJson(options: { includeHistory?: boolean } = {}, db: Db = getDb()): ExportBundle {
  const table = (name: string) => db.all(`SELECT * FROM ${name}`);
  const counts: Record<string, number> = {};
  const collect = (name: string) => {
    const rows = table(name);
    counts[name] = rows.length;
    return rows;
  };

  return {
    meta: {
      app: 'datahypotenus',
      format_version: EXPORT_FORMAT_VERSION,
      schema_version: schemaVersion(db),
      exported_at: nowIso(),
      counts,
    },
    settings: getAllSettings(db),
    statuses: collect('item_statuses'),
    categories: collect('categories'),
    locations: collect('locations'),
    vendors: collect('vendors'),
    tags: collect('tags'),
    items: collect('items'),
    item_tags: collect('item_tags'),
    shopping_items: collect('shopping_items'),
    attachments: collect('attachments'),
    files: collect('files'),
    maintenance_records: collect('maintenance_records'),
    item_events: options.includeHistory === false ? [] : collect('item_events'),
  };
}

export const CSV_COLUMNS = [
  'uid',
  'name',
  'description',
  'category_path',
  'location_path',
  'status',
  'quantity',
  'unit',
  'is_consumable',
  'min_quantity',
  'brand',
  'model',
  'serial_number',
  'sku',
  'barcode',
  'purchase_price',
  'currency',
  'purchase_date',
  'vendor',
  'product_url',
  'warranty_months',
  'warranty_start',
  'warranty_end',
  'expiration_date',
  'tags',
  'notes',
  'created_at',
  'updated_at',
] as const;

export function exportItemsCsv(db: Db = getDb()): string {
  const rows = db.all<Record<string, unknown>>(`
    SELECT i.uid, i.name, i.description,
           cp.path AS category_path,
           lp.path AS location_path,
           s.label AS status,
           i.quantity, i.unit, i.is_consumable, i.min_quantity,
           i.brand, i.model, i.serial_number, i.sku, i.barcode,
           i.purchase_price, i.currency, i.purchase_date,
           v.name AS vendor, i.product_url,
           i.warranty_months, i.warranty_start, i.warranty_end, i.expiration_date,
           (SELECT group_concat(t.name, '; ') FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE it.item_id = i.id) AS tags,
           i.notes, i.created_at, i.updated_at
    FROM items i
    LEFT JOIN category_paths cp ON cp.id = i.category_id
    LEFT JOIN location_paths lp ON lp.id = i.location_id
    LEFT JOIN vendors v ON v.id = i.vendor_id
    JOIN item_statuses s ON s.id = i.status_id
    WHERE i.deleted_at IS NULL
    ORDER BY i.name COLLATE NOCASE
  `);
  return toCsv(rows, [...CSV_COLUMNS]);
}

/** Trova (o crea) il nodo corrispondente a un percorso "A / B / C". */
function ensurePath(db: Db, table: 'categories' | 'locations', pathText: string): number | null {
  const parts = pathText
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  let parentId: number | null = null;
  for (const part of parts) {
    const existing: { id: number } | undefined = db.get<{ id: number }>(
      `SELECT id FROM ${table} WHERE name = ? COLLATE NOCASE AND ifnull(parent_id, -1) = ifnull(?, -1)`,
      part,
      parentId,
    );
    if (existing) {
      parentId = existing.id;
    } else if (table === 'categories') {
      parentId = db.run('INSERT INTO categories (parent_id, name) VALUES (?, ?)', parentId, part).lastInsertRowid;
    } else {
      // In import una posizione intermedia nasce come 'other': l'utente puo'
      // poi qualificarla come stanza, mobile o contenitore.
      parentId = db.run('INSERT INTO locations (parent_id, name, kind) VALUES (?, ?, ?)', parentId, part, 'other').lastInsertRowid;
    }
  }
  return parentId;
}

function resolveStatusId(db: Db, label: string | undefined): number | undefined {
  if (!label) return undefined;
  const row =
    db.get<{ id: number }>('SELECT id FROM item_statuses WHERE label = ? COLLATE NOCASE', label) ??
    db.get<{ id: number }>('SELECT id FROM item_statuses WHERE key = ? COLLATE NOCASE', label);
  return row?.id;
}

function resolveVendor(db: Db, name: string | undefined): number | null {
  if (!name || !name.trim()) return null;
  const found = db.get<{ id: number }>('SELECT id FROM vendors WHERE name = ? COLLATE NOCASE', name.trim());
  return found ? found.id : db.run('INSERT INTO vendors (name) VALUES (?)', name.trim()).lastInsertRowid;
}

const num = (v: string | undefined): number | null => {
  if (v === undefined || v.trim() === '') return null;
  const n = Number.parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const bool = (v: string | undefined): boolean => ['1', 'true', 'si', 'sì', 'yes', 'x'].includes((v ?? '').toLowerCase());

export type ImportReport = {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; name?: string; message: string }>;
  created_categories: number;
  created_locations: number;
};

export type ImportMode = 'merge' | 'create_only';

/** Import da CSV. Le colonne mancanti sono semplicemente ignorate. */
export function importItemsCsv(csv: string, mode: ImportMode = 'merge', db: Db = getDb()): ImportReport {
  const rows = parseCsv(csv);
  if (rows.length === 0) throw badRequest('Il file CSV non contiene righe');

  const report: ImportReport = { created: 0, updated: 0, skipped: 0, errors: [], created_categories: 0, created_locations: 0 };
  const categoriesBefore = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM categories')?.n ?? 0;
  const locationsBefore = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM locations')?.n ?? 0;

  db.transaction(() => {
    rows.forEach((row, index) => {
      try {
        const name = (row.name ?? '').trim();
        if (!name) {
          report.skipped++;
          return;
        }

        const payload = {
          name,
          description: row.description || null,
          category_id: row.category_path ? ensurePath(db, 'categories', row.category_path) : null,
          location_id: row.location_path ? ensurePath(db, 'locations', row.location_path) : null,
          status_id: resolveStatusId(db, row.status) ?? null,
          vendor_id: resolveVendor(db, row.vendor),
          quantity: num(row.quantity) ?? 1,
          unit: row.unit || 'pz',
          is_consumable: bool(row.is_consumable),
          min_quantity: num(row.min_quantity),
          brand: row.brand || null,
          model: row.model || null,
          serial_number: row.serial_number || null,
          sku: row.sku || null,
          barcode: row.barcode || null,
          purchase_price: num(row.purchase_price),
          currency: row.currency || 'EUR',
          purchase_date: row.purchase_date || null,
          product_url: row.product_url || null,
          warranty_months: num(row.warranty_months),
          warranty_start: row.warranty_start || null,
          warranty_end: row.warranty_end || null,
          expiration_date: row.expiration_date || null,
          notes: row.notes || null,
          tags: (row.tags ?? '')
            .split(/[;,]/)
            .map((t) => t.trim())
            .filter(Boolean),
          uid: row.uid || undefined,
        };

        const existing = payload.uid ? db.get<{ id: number }>('SELECT id FROM items WHERE uid = ?', payload.uid) : undefined;
        if (existing) {
          if (mode === 'create_only') {
            report.skipped++;
            return;
          }
          updateItem(existing.id, payload, db);
          report.updated++;
        } else {
          createItem(payload, db);
          report.created++;
        }
      } catch (err) {
        report.errors.push({ row: index + 2, name: row.name, message: err instanceof Error ? err.message : String(err) });
      }
    });
  });

  report.created_categories = (db.get<{ n: number }>('SELECT COUNT(*) AS n FROM categories')?.n ?? 0) - categoriesBefore;
  report.created_locations = (db.get<{ n: number }>('SELECT COUNT(*) AS n FROM locations')?.n ?? 0) - locationsBefore;
  log.info(`import CSV: ${report.created} creati, ${report.updated} aggiornati, ${report.errors.length} errori`);
  return report;
}

/**
 * Import da bundle JSON prodotto da questa applicazione.
 * Ricrea/aggiorna gli oggetti con la stessa logica di merge del CSV, mantenendo
 * i percorsi di categoria e posizione. Non tocca gli allegati fisici: per un
 * ripristino completo, allegati compresi, si usa il restore di un backup.
 */
export function importJson(bundle: unknown, mode: ImportMode = 'merge', db: Db = getDb()): ImportReport {
  if (!bundle || typeof bundle !== 'object') throw badRequest('Bundle JSON non valido');
  const data = bundle as Partial<ExportBundle> & { items?: Array<Record<string, unknown>> };
  if (!Array.isArray(data.items)) throw badRequest('Il bundle non contiene la sezione "items"');

  // Ricostruisce i percorsi completi risalendo i parent presenti nel bundle.
  const fullPath = (rows: Array<Record<string, unknown>>, id: number): string => {
    const parts: string[] = [];
    let current = rows.find((r) => Number(r.id) === id);
    let guard = 0;
    while (current && guard++ < 50) {
      parts.unshift(String(current.name ?? ''));
      const parentId = current.parent_id === null || current.parent_id === undefined ? null : Number(current.parent_id);
      current = parentId === null ? undefined : rows.find((r) => Number(r.id) === parentId);
    }
    return parts.join(' / ');
  };

  const categories = (data.categories ?? []) as Array<Record<string, unknown>>;
  const locations = (data.locations ?? []) as Array<Record<string, unknown>>;
  const statuses = (data.statuses ?? []) as Array<Record<string, unknown>>;
  const tagsById = new Map<number, string>(
    ((data.tags ?? []) as Array<Record<string, unknown>>).map((t) => [Number(t.id), String(t.name ?? '')]),
  );
  const itemTags = new Map<number, string[]>();
  for (const link of ((data.item_tags ?? []) as Array<Record<string, unknown>>)) {
    const itemId = Number(link.item_id);
    const tagName = tagsById.get(Number(link.tag_id));
    if (!tagName) continue;
    itemTags.set(itemId, [...(itemTags.get(itemId) ?? []), tagName]);
  }

  const report: ImportReport = { created: 0, updated: 0, skipped: 0, errors: [], created_categories: 0, created_locations: 0 };

  db.transaction(() => {
    (data.items as Array<Record<string, unknown>>).forEach((row, index) => {
      try {
        const uid = row.uid ? String(row.uid) : undefined;
        const statusRow = statuses.find((s) => Number(s.id) === Number(row.status_id));
        const payload = {
          name: String(row.name ?? '').trim(),
          description: (row.description as string) ?? null,
          category_id: row.category_id ? ensurePath(db, 'categories', fullPath(categories, Number(row.category_id))) : null,
          location_id: row.location_id ? ensurePath(db, 'locations', fullPath(locations, Number(row.location_id))) : null,
          status_id: resolveStatusId(db, statusRow ? String(statusRow.key) : undefined) ?? null,
          vendor_id: null,
          quantity: Number(row.quantity ?? 1),
          unit: String(row.unit ?? 'pz'),
          is_consumable: Number(row.is_consumable ?? 0) === 1,
          min_quantity: row.min_quantity === null ? null : Number(row.min_quantity),
          brand: (row.brand as string) ?? null,
          model: (row.model as string) ?? null,
          serial_number: (row.serial_number as string) ?? null,
          sku: (row.sku as string) ?? null,
          barcode: (row.barcode as string) ?? null,
          purchase_price: row.purchase_price === null ? null : Number(row.purchase_price),
          currency: String(row.currency ?? 'EUR'),
          purchase_date: (row.purchase_date as string) ?? null,
          product_url: (row.product_url as string) ?? null,
          warranty_months: row.warranty_months === null ? null : Number(row.warranty_months),
          warranty_start: (row.warranty_start as string) ?? null,
          warranty_end: (row.warranty_end as string) ?? null,
          expiration_date: (row.expiration_date as string) ?? null,
          notes: (row.notes as string) ?? null,
          tags: itemTags.get(Number(row.id)) ?? [],
          uid,
        };
        if (!payload.name) {
          report.skipped++;
          return;
        }

        const existing = uid ? db.get<{ id: number }>('SELECT id FROM items WHERE uid = ?', uid) : undefined;
        if (existing) {
          if (mode === 'create_only') {
            report.skipped++;
            return;
          }
          updateItem(existing.id, payload, db);
          report.updated++;
        } else {
          createItem(payload, db);
          report.created++;
        }
      } catch (err) {
        report.errors.push({ row: index + 1, name: String(row.name ?? ''), message: err instanceof Error ? err.message : String(err) });
      }
    });

    // I tag orfani (presenti nel bundle ma non usati) restano comunque disponibili.
    resolveTagIds([...tagsById.values()].filter(Boolean), db);
  });

  log.info(`import JSON: ${report.created} creati, ${report.updated} aggiornati, ${report.errors.length} errori`);
  return report;
}

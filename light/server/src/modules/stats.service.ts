/**
 * Statistiche e analisi delle spese.
 *
 * Nota di modello: il valore di un oggetto e' `purchase_price * quantity`
 * (il prezzo memorizzato e' unitario, vedi assunzione A3). Non esiste
 * conversione di cambio: gli importi sono aggregati nella valuta del record e
 * la valuta predefinita e' quella impostata in Impostazioni.
 */
import type { Db } from '../db/connection.ts';
import { getDb } from '../db/connection.ts';
import { getSetting } from './settings.service.ts';

export type Bucket = { key: string; label: string; items: number; units: number; value: number };

/** Solo cio' che si possiede davvero: gli stati con counts_as_owned = 0
 *  (da acquistare, venduto, consumato...) non fanno patrimonio. */
const OWNED_WHERE = 'WHERE i.deleted_at IS NULL AND st.counts_as_owned = 1';

const round = (n: number | null | undefined) => Math.round((n ?? 0) * 100) / 100;
const normalize = (rows: Bucket[]): Bucket[] => rows.map((r) => ({ ...r, value: round(r.value), units: round(r.units) }));

/** Spesa e conteggi per categoria radice (le sottocategorie confluiscono nel ramo). */
export function byCategory(db: Db = getDb()): Bucket[] {
  return normalize(
    db.all<Bucket>(`
      SELECT COALESCE(CAST(cp.root_id AS TEXT), 'none') AS key,
             COALESCE(root.name, 'Senza categoria')     AS label,
             COUNT(*)                                   AS items,
             COALESCE(SUM(i.quantity), 0)               AS units,
             COALESCE(SUM(COALESCE(i.purchase_price, 0) * i.quantity), 0) AS value
      FROM items i
      JOIN item_statuses st       ON st.id = i.status_id
      LEFT JOIN category_paths cp ON cp.id = i.category_id
      LEFT JOIN categories root   ON root.id = cp.root_id
      ${OWNED_WHERE}
      GROUP BY cp.root_id, root.name
      ORDER BY value DESC, items DESC
    `),
  );
}

/**
 * Spesa e conteggi per stanza (le sotto-posizioni confluiscono nella stanza).
 *
 * Cosa NON e' una stanza (balcone, cantina esterna, un contenitore appeso
 * direttamente all'edificio) non ha `room_id`: in quel caso fa gruppo da solo,
 * con il proprio nome. Raggruppare sul `root_id` - cioe' sull'edificio -
 * fondeva tutte le posizioni non-stanza in un'unica riga etichettata con una
 * di loro a caso, e per giunta con il percorso completo ("Casa / Balcone")
 * invece del nome, in mezzo a righe che mostravano solo il nome.
 */
export function byRoom(db: Db = getDb()): Bucket[] {
  return normalize(
    db.all<Bucket>(`
      SELECT COALESCE(CAST(lp.room_id AS TEXT), CAST(lp.id AS TEXT), 'none') AS key,
             COALESCE(lp.room_name, lp.name, 'Senza posizione') AS label,
             COUNT(*) AS items,
             COALESCE(SUM(i.quantity), 0) AS units,
             COALESCE(SUM(COALESCE(i.purchase_price, 0) * i.quantity), 0) AS value
      FROM items i
      JOIN item_statuses st       ON st.id = i.status_id
      LEFT JOIN location_paths lp ON lp.id = i.location_id
      ${OWNED_WHERE}
      GROUP BY COALESCE(lp.room_id, lp.id), COALESCE(lp.room_name, lp.name)
      ORDER BY value DESC, items DESC
    `),
  );
}

/** Distribuzione per stato: qui servono TUTTI gli stati, anche i non posseduti. */
export function byStatus(db: Db = getDb()): Bucket[] {
  return normalize(
    db.all<Bucket>(`
      SELECT st.key AS key, st.label AS label,
             COUNT(*) AS items,
             COALESCE(SUM(i.quantity), 0) AS units,
             COALESCE(SUM(COALESCE(i.purchase_price, 0) * i.quantity), 0) AS value
      FROM items i
      JOIN item_statuses st ON st.id = i.status_id
      WHERE i.deleted_at IS NULL
      GROUP BY st.id
      ORDER BY st.sort_order
    `),
  );
}

export function byVendor(limit = 15, db: Db = getDb()): Bucket[] {
  return normalize(
    db.all<Bucket>(
      `SELECT COALESCE(CAST(v.id AS TEXT), 'none') AS key,
              COALESCE(v.name, 'Senza negozio')    AS label,
              COUNT(*) AS items,
              COALESCE(SUM(i.quantity), 0) AS units,
              COALESCE(SUM(COALESCE(i.purchase_price, 0) * i.quantity), 0) AS value
       FROM items i
       JOIN item_statuses st ON st.id = i.status_id
       LEFT JOIN vendors v   ON v.id = i.vendor_id
       ${OWNED_WHERE}
       GROUP BY v.id, v.name
       ORDER BY value DESC
       LIMIT ?`,
      limit,
    ),
  );
}

/** Spesa mensile: serie continua, i mesi senza acquisti restano a zero. */
export function byMonth(months = 12, db: Db = getDb()): Array<{ month: string; items: number; value: number }> {
  const rows = db.all<{ month: string; items: number; value: number }>(
    `SELECT strftime('%Y-%m', i.purchase_date) AS month,
            COUNT(*) AS items,
            COALESCE(SUM(COALESCE(i.purchase_price, 0) * i.quantity), 0) AS value
     FROM items i
     WHERE i.deleted_at IS NULL AND i.purchase_date IS NOT NULL
       AND i.purchase_date >= date('now', ?)
     GROUP BY month
     ORDER BY month`,
    `-${Math.max(1, months)} months`,
  );

  const byKey = new Map(rows.map((r) => [r.month, r]));
  const series: Array<{ month: string; items: number; value: number }> = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const found = byKey.get(key);
    series.push({ month: key, items: found?.items ?? 0, value: round(found?.value) });
  }
  return series;
}

export type StatsPayload = {
  currency: string;
  totals: { items: number; units: number; value: number; current_value: number; with_price: number; without_price: number };
  by_category: Bucket[];
  by_room: Bucket[];
  by_status: Bucket[];
  by_vendor: Bucket[];
  by_month: Array<{ month: string; items: number; value: number }>;
  top_items: Array<{ id: number; name: string; value: number; currency: string; category: string | null }>;
};

export function buildStats(months = 12, db: Db = getDb()): StatsPayload {
  const totals = db.get<{
    items: number;
    units: number;
    value: number;
    current_value: number;
    with_price: number;
    without_price: number;
  }>(`
    SELECT COUNT(*) AS items,
           COALESCE(SUM(i.quantity), 0) AS units,
           COALESCE(SUM(COALESCE(i.purchase_price, 0) * i.quantity), 0) AS value,
           COALESCE(SUM(COALESCE(i.current_value, i.purchase_price, 0) * i.quantity), 0) AS current_value,
           SUM(CASE WHEN i.purchase_price IS NOT NULL THEN 1 ELSE 0 END) AS with_price,
           SUM(CASE WHEN i.purchase_price IS NULL THEN 1 ELSE 0 END) AS without_price
    FROM items i
    JOIN item_statuses st ON st.id = i.status_id
    ${OWNED_WHERE}
  `);

  const topItems = db.all<{ id: number; name: string; value: number; currency: string; category: string | null }>(`
    SELECT i.id, i.name, ROUND(COALESCE(i.purchase_price, 0) * i.quantity, 2) AS value, i.currency, cp.path AS category
    FROM items i
    LEFT JOIN category_paths cp ON cp.id = i.category_id
    WHERE i.deleted_at IS NULL AND i.purchase_price IS NOT NULL
    ORDER BY value DESC
    LIMIT 10
  `);

  return {
    currency: getSetting('app.default_currency', 'EUR', db),
    totals: {
      items: totals?.items ?? 0,
      units: round(totals?.units),
      value: round(totals?.value),
      current_value: round(totals?.current_value),
      with_price: totals?.with_price ?? 0,
      without_price: totals?.without_price ?? 0,
    },
    by_category: byCategory(db),
    by_room: byRoom(db),
    by_status: byStatus(db),
    by_vendor: byVendor(15, db),
    by_month: byMonth(months, db),
    top_items: topItems,
  };
}

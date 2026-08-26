/**
 * Dashboard: la risposta alla domanda "come sta la casa adesso".
 * Ogni riquadro deve essere azionabile, non decorativo: sono tutte cose che
 * richiedono una decisione (comprare, buttare, riparare, rinnovare).
 */
import type { Db } from '../db/connection.ts';
import { getDb } from '../db/connection.ts';
import { getNumericSetting, getSetting } from './settings.service.ts';
import { listItems } from './items.service.ts';
import { listShopping } from './shopping.service.ts';
import type { ItemView } from './items.types.ts';
import type { ShoppingRow } from './shopping.service.ts';

export type DashboardTotals = {
  items: number;
  units: number;
  categories: number;
  locations: number;
  rooms: number;
  containers: number;
  tags: number;
  attachments: number;
  trash: number;
  inventory_value: number;
  currency: string;
};

export type DashboardPayload = {
  totals: DashboardTotals;
  spending: { last_30_days: number; this_month: number; this_year: number; total: number };
  recent_added: ItemView[];
  recent_updated: ItemView[];
  to_buy: { count: number; estimated_total: number; items: ShoppingRow[] };
  low_stock: { count: number; items: ItemView[] };
  warranties: { expiring_count: number; expired_count: number; items: ItemView[] };
  expirations: { expiring_count: number; expired_count: number; items: ItemView[] };
  attention_count: number;
};

export function buildDashboard(db: Db = getDb()): DashboardPayload {
  const limit = getNumericSetting('alerts.dashboard_limit', 8, db);
  const warrantyDays = getNumericSetting('alerts.warranty_days', 60, db);
  const expirationDays = getNumericSetting('alerts.expiration_days', 30, db);
  const currency = getSetting('app.default_currency', 'EUR', db);

  const counts = db.get<DashboardTotals>(`
    SELECT
      (SELECT COUNT(*) FROM items WHERE deleted_at IS NULL) AS items,
      (SELECT COALESCE(SUM(i.quantity), 0) FROM items i JOIN item_statuses s ON s.id = i.status_id
        WHERE i.deleted_at IS NULL AND s.counts_as_owned = 1) AS units,
      (SELECT COUNT(*) FROM categories) AS categories,
      (SELECT COUNT(*) FROM locations) AS locations,
      (SELECT COUNT(*) FROM locations WHERE kind = 'room') AS rooms,
      (SELECT COUNT(*) FROM locations WHERE kind = 'container') AS containers,
      (SELECT COUNT(*) FROM tags) AS tags,
      (SELECT COUNT(*) FROM attachments) AS attachments,
      (SELECT COUNT(*) FROM items WHERE deleted_at IS NOT NULL) AS trash,
      (SELECT COALESCE(SUM(COALESCE(i.purchase_price, 0) * i.quantity), 0)
         FROM items i JOIN item_statuses s ON s.id = i.status_id
        WHERE i.deleted_at IS NULL AND s.counts_as_owned = 1) AS inventory_value
  `);

  const spending = db.get<{ last_30_days: number; this_month: number; this_year: number; total: number }>(`
    SELECT
      COALESCE(SUM(CASE WHEN purchase_date >= date('now', '-30 days') THEN COALESCE(purchase_price, 0) * quantity END), 0) AS last_30_days,
      COALESCE(SUM(CASE WHEN strftime('%Y-%m', purchase_date) = strftime('%Y-%m', 'now') THEN COALESCE(purchase_price, 0) * quantity END), 0) AS this_month,
      COALESCE(SUM(CASE WHEN strftime('%Y', purchase_date) = strftime('%Y', 'now') THEN COALESCE(purchase_price, 0) * quantity END), 0) AS this_year,
      COALESCE(SUM(COALESCE(purchase_price, 0) * quantity), 0) AS total
    FROM items WHERE deleted_at IS NULL AND purchase_date IS NOT NULL
  `);

  const recentAdded = listItems({ sort: 'created_at', direction: 'desc', limit }, db);
  const recentUpdated = listItems({ sort: 'updated_at', direction: 'desc', limit }, db);
  const lowStock = listItems({ below_min: true, sort: 'quantity', direction: 'asc', limit }, db);
  const warrantyExpiring = listItems(
    { warranty: 'expiring', expiring_within_days: warrantyDays, sort: 'updated_at', direction: 'desc', limit },
    db,
  );
  const warrantyExpired = listItems({ warranty: 'expired', limit: 1 }, db);
  const expiring = listItems({ expiring_within_days: expirationDays, sort: 'updated_at', direction: 'desc', limit }, db);
  const expired = listItems({ expired: true, limit: 1 }, db);
  const shopping = listShopping({ status: 'da_comprare' }, db);

  const round = (n: number) => Math.round(n * 100) / 100;

  return {
    totals: {
      items: counts?.items ?? 0,
      units: round(counts?.units ?? 0),
      categories: counts?.categories ?? 0,
      locations: counts?.locations ?? 0,
      rooms: counts?.rooms ?? 0,
      containers: counts?.containers ?? 0,
      tags: counts?.tags ?? 0,
      attachments: counts?.attachments ?? 0,
      trash: counts?.trash ?? 0,
      inventory_value: round(counts?.inventory_value ?? 0),
      currency,
    },
    spending: {
      last_30_days: round(spending?.last_30_days ?? 0),
      this_month: round(spending?.this_month ?? 0),
      this_year: round(spending?.this_year ?? 0),
      total: round(spending?.total ?? 0),
    },
    recent_added: recentAdded.items,
    recent_updated: recentUpdated.items,
    to_buy: {
      count: shopping.items.length,
      estimated_total: shopping.estimated_total,
      items: shopping.items.slice(0, limit),
    },
    low_stock: { count: lowStock.total, items: lowStock.items },
    warranties: {
      expiring_count: warrantyExpiring.total,
      expired_count: warrantyExpired.total,
      items: warrantyExpiring.items,
    },
    expirations: { expiring_count: expiring.total, expired_count: expired.total, items: expiring.items },
    attention_count: lowStock.total + warrantyExpiring.total + expiring.total + expired.total,
  };
}

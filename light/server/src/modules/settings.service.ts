/**
 * Impostazioni applicative persistite nel database (chiave/valore testuale).
 *
 * Distinzione importante rispetto a `config.ts`:
 *   - config.ts  = configurazione di DEPLOY (porte, percorsi, log) -> env/.env
 *   - settings   = preferenze d'USO (valuta, soglie di avviso) -> database
 * Le seconde devono seguire il database quando lo si sposta su un'altra macchina.
 */
import type { Db } from '../db/connection.ts';
import { getDb } from '../db/connection.ts';
import { nowIso } from '../core/dates.ts';

export type SettingsMap = Record<string, string>;

export const SETTING_DEFAULTS: SettingsMap = {
  'app.default_currency': 'EUR',
  'app.default_unit': 'pz',
  'alerts.warranty_days': '60',
  'alerts.expiration_days': '30',
  'alerts.dashboard_limit': '8',
  'backup.keep': '10',
  'inventory.page_size': '50',
};

export function getAllSettings(db: Db = getDb()): SettingsMap {
  const rows = db.all<{ key: string; value: string }>('SELECT key, value FROM settings');
  const map: SettingsMap = { ...SETTING_DEFAULTS };
  for (const row of rows) map[row.key] = row.value;
  return map;
}

export function getSetting(key: string, fallback = '', db: Db = getDb()): string {
  const row = db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? SETTING_DEFAULTS[key] ?? fallback;
}

export function getNumericSetting(key: string, fallback: number, db: Db = getDb()): number {
  const n = Number.parseFloat(getSetting(key, String(fallback), db));
  return Number.isFinite(n) ? n : fallback;
}

export function setSetting(key: string, value: string, db: Db = getDb()): void {
  db.run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key,
    value,
    nowIso(),
  );
}

export function setSettings(values: SettingsMap, db: Db = getDb()): SettingsMap {
  db.transaction(() => {
    for (const [key, value] of Object.entries(values)) setSetting(key, String(value), db);
  });
  return getAllSettings(db);
}

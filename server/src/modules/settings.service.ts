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
import { badRequest } from '../core/errors.ts';

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

/**
 * Regole di validita' delle preferenze.
 *
 * Non e' pedanteria: `app.default_currency` finisce dentro `Intl.NumberFormat`,
 * e un codice vuoto o inventato lancia un'eccezione che porta via l'intera
 * pagina. Una preferenza sbagliata deve fermarsi qui, non arrivare al render.
 */
const RULES: Record<string, (value: string) => string | null> = {
  'app.default_currency': (value) =>
    /^[A-Za-z]{3}$/.test(value.trim()) ? null : 'La valuta è un codice di tre lettere, per esempio EUR',
  'app.default_unit': (value) => (value.trim().length > 0 && value.trim().length <= 8 ? null : 'L’unità di misura è obbligatoria, al massimo 8 caratteri'),
  'alerts.warranty_days': (value) => integerBetween(value, 1, 365),
  'alerts.expiration_days': (value) => integerBetween(value, 1, 365),
  'alerts.dashboard_limit': (value) => integerBetween(value, 3, 20),
  'backup.keep': (value) => integerBetween(value, 1, 50),
  'inventory.page_size': (value) => integerBetween(value, 10, 500),
};

function integerBetween(value: string, min: number, max: number): string | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? null : `Serve un numero intero fra ${min} e ${max}`;
}

export function setSettings(values: SettingsMap, db: Db = getDb()): SettingsMap {
  const normalized: SettingsMap = {};
  for (const [key, raw] of Object.entries(values)) {
    const value = String(raw).trim();
    const problem = RULES[key]?.(value);
    if (problem) throw badRequest(problem, [{ field: key, message: problem }]);
    normalized[key] = key === 'app.default_currency' ? value.toUpperCase() : value;
  }

  db.transaction(() => {
    for (const [key, value] of Object.entries(normalized)) setSetting(key, value, db);
  });
  return getAllSettings(db);
}

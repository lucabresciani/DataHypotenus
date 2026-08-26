/**
 * Utilita' di data.
 *
 * Convenzione del progetto:
 *  - le DATE (acquisto, scadenza, garanzia) sono stringhe `YYYY-MM-DD`;
 *  - i TIMESTAMP (created_at, updated_at, eventi) sono stringhe ISO-8601 UTC.
 * Motivazione: SQLite non ha un tipo data; il testo ISO e' ordinabile,
 * confrontabile con BETWEEN, leggibile in un export CSV e indipendente dal
 * fuso orario della macchina su cui gira il server.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayIso(now: Date = new Date()): string {
  // Data locale: "oggi" per l'utente non e' "oggi UTC" alle 01:00 in Italia.
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Somma mesi a una data `YYYY-MM-DD`, gestendo i mesi di lunghezza diversa. */
export function addMonths(date: string, months: number): string {
  if (!isDateString(date)) throw new Error(`Data non valida: ${date}`);
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  if (!isDateString(date)) throw new Error(`Data non valida: ${date}`);
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

/** Giorni fra due date (b - a). Negativo se `b` precede `a`. */
export function daysBetween(a: string, b: string): number {
  const ms = new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

/** Timestamp compatto per i nomi delle cartelle di backup: 20250826-143012. */
export function backupStamp(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
    `-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  );
}

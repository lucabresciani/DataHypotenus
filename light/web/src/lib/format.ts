/** Formattazione per l'interfaccia italiana: numeri, valute, date, dimensioni. */

const currencyCache = new Map<string, Intl.NumberFormat>();

/**
 * `Intl.NumberFormat` lancia su un codice valuta non valido, e un throw dentro
 * un render porta via l'intera pagina. Un dato storto in un campo non deve mai
 * costare la schermata: qui si degrada a "numero + codice".
 */
function formatterFor(currency: string): Intl.NumberFormat | null {
  const cached = currencyCache.get(currency);
  if (cached) return cached;
  try {
    const formatter = new Intl.NumberFormat('it-IT', { style: 'currency', currency, maximumFractionDigits: 2 });
    currencyCache.set(currency, formatter);
    return formatter;
  } catch {
    return null;
  }
}

export function money(value: number | null | undefined, currency = 'EUR'): string {
  if (value === null || value === undefined) return '—';
  const formatter = formatterFor(currency);
  if (formatter) return formatter.format(value);
  return `${number(value)}${currency ? ` ${currency}` : ''}`;
}

/** Importi compatti per i riquadri di sintesi: 1.240 € invece di 1.240,00 €. */
export function moneyShort(value: number | null | undefined, currency = 'EUR'): string {
  if (value === null || value === undefined) return '—';
  try {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency,
      maximumFractionDigits: value >= 1000 ? 0 : 2,
    }).format(value);
  } catch {
    return `${number(value)}${currency ? ` ${currency}` : ''}`;
  }
}

/** Le quantita' intere non mostrano decimali: "6 pz", non "6,00 pz". */
export function quantity(value: number, unit?: string): string {
  const text = Number.isInteger(value) ? String(value) : value.toLocaleString('it-IT', { maximumFractionDigits: 3 });
  return unit ? `${text} ${unit}` : text;
}

export function number(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('it-IT', { maximumFractionDigits: 2 });
}

/**
 * "1 oggetto" / "3 oggetti". In italiano l'accordo non e' un dettaglio: un
 * "1 eventi" in una scheda fa sembrare sbagliato anche il resto della pagina.
 */
export function plural(count: number, one: string, many: string): string {
  return `${number(count)} ${count === 1 ? one : many}`;
}

export function date(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** "oggi", "ieri", "3 giorni fa": nella cronologia conta la distanza, non la data. */
export function relativeTime(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  const diffMs = Date.now() - parsed.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMs < 60_000) return 'adesso';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)} min fa`;
  if (diffDays === 0) return `${Math.floor(diffMs / 3_600_000)} h fa`;
  if (diffDays === 1) return 'ieri';
  if (diffDays < 30) return `${diffDays} giorni fa`;
  return date(value);
}

/** Giorni mancanti in parole: "fra 12 giorni", "scaduta da 3 giorni". */
export function daysPhrase(days: number | null | undefined, feminine = false): string {
  if (days === null || days === undefined) return '';
  if (days === 0) return 'oggi';
  if (days === 1) return 'domani';
  if (days === -1) return 'ieri';
  if (days > 0) return `fra ${days} giorni`;
  return `${feminine ? 'scaduta' : 'scaduto'} da ${Math.abs(days)} giorni`;
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

/** "2026-03" -> "mar 26" per le etichette del grafico mensile. */
export function monthLabel(key: string): string {
  const [year, month] = key.split('-');
  const index = Number.parseInt(month ?? '1', 10) - 1;
  return `${MONTHS[index] ?? month} ${(year ?? '').slice(2)}`;
}

/** Nome del backup (20260826-143012) in data leggibile. */
export function backupLabel(name: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(name);
  if (!match) return name;
  const [, y, m, d, hh, mm] = match;
  return `${d}/${m}/${y} ${hh}:${mm}`;
}

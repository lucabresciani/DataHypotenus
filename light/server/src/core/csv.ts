/**
 * CSV minimale conforme a RFC 4180 (virgola, virgolette doppie, escape "").
 * Scritto a mano: import/export CSV non giustifica una dipendenza esterna, e
 * il formato deve restare prevedibile perche' e' una delle garanzie anti
 * lock-in del progetto (requisito 19).
 */

export function toCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'string' ? value : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: Array<Record<string, unknown>>, columns?: string[]): string {
  const cols = columns ?? (rows.length > 0 ? Object.keys(rows[0] as Record<string, unknown>) : []);
  const lines = [cols.join(',')];
  for (const row of rows) lines.push(cols.map((c) => toCsvValue(row[c])).join(','));
  // BOM UTF-8: senza, Excel su Windows sbaglia gli accenti.
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

/** Ritorna le righe come oggetti, usando la prima riga come intestazione. */
export function parseCsv(input: string): Array<Record<string, string>> {
  const text = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const header = rows.shift();
  if (!header) return [];
  const columns = header.map((h) => h.trim());
  return rows
    .filter((r) => r.some((cell) => cell.trim() !== ''))
    .map((r) => Object.fromEntries(columns.map((col, idx) => [col, (r[idx] ?? '').trim()])));
}

/**
 * Identificatori pubblici degli oggetti (`items.uid`).
 *
 * Decisione -> Motivazione -> Alternative
 * Ogni oggetto ha, oltre alla chiave numerica interna, un identificatore
 * testuale stabile e ordinabile nel tempo. Serve per: QR code, export/import
 * idempotente (merge per uid) ed eventuale sincronizzazione futura fra device,
 * dove gli id autoincrementali collidono. Alternative: UUIDv4 (non ordinabile,
 * piu' lungo), solo id numerico (collisioni in import/sync).
 *
 * Formato: 10 char di timestamp base32 + 12 char casuali base32 (Crockford).
 */
import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: niente I, L, O, U
const TIME_LEN = 10;
const RANDOM_LEN = 12;

function encodeTime(now: number): string {
  let out = '';
  let value = now;
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    out = ALPHABET[value % 32] + out;
    value = Math.floor(value / 32);
  }
  return out;
}

function encodeRandom(): string {
  const bytes = randomBytes(RANDOM_LEN);
  let out = '';
  for (let i = 0; i < RANDOM_LEN; i++) out += ALPHABET[(bytes[i] as number) % 32];
  return out;
}

/** Nuovo identificatore pubblico, ordinabile lessicograficamente per data. */
export function newUid(now: number = Date.now()): string {
  return encodeTime(now) + encodeRandom();
}

const UID_RE = new RegExp(`^[${ALPHABET}]{${TIME_LEN + RANDOM_LEN}}$`);

export function isUid(value: string): boolean {
  return UID_RE.test(value);
}

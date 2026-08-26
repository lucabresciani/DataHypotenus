/**
 * Ponte fra Zod e Fastify: le route validano gli input qui e ricevono dati
 * gia' tipizzati. Un input non valido diventa sempre un errore 422 con il
 * dettaglio dei campi, mai un 500.
 */
import { z, type ZodType } from 'zod';
import { AppError } from '../core/errors.ts';

export function parse<T>(schema: ZodType<T>, data: unknown, what = 'dati'): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.') || '(radice)',
      message: issue.message,
    }));
    throw new AppError(422, 'validation_error', `Controlla i ${what} inseriti`, details);
  }
  return result.data;
}

/** Query string: tutto arriva come stringa, questi helper riportano i tipi. */
export const qpInt = z.coerce.number().int();
export const qpNumber = z.coerce.number();
export const qpBool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'si', 'yes', 'on'].includes(v.toLowerCase())));

/** Lista da query string: "1,2,3" oppure ripetizione del parametro. */
export const qpIntList = z
  .union([z.string(), z.array(z.union([z.string(), z.number()])), z.number()])
  .transform((v) => {
    const raw = Array.isArray(v) ? v : String(v).split(',');
    return raw
      .map((x) => Number.parseInt(String(x).trim(), 10))
      .filter((n) => Number.isFinite(n));
  });

export const idParamSchema = z.object({ id: qpInt.positive() });

export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato data atteso: AAAA-MM-GG')
  .nullable();

/** Stringa che, se vuota, diventa null: i form HTML mandano "" non null. */
export const nullableText = z
  .union([z.string(), z.null()])
  .transform((v) => (v === null || v.trim() === '' ? null : v.trim()));

export const nullableNumber = z
  .union([z.number(), z.string(), z.null()])
  .transform((v) => {
    if (v === null || v === '') return null;
    const n = typeof v === 'number' ? v : Number.parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  });

export const nullableId = z
  .union([z.number(), z.string(), z.null()])
  .transform((v) => {
    if (v === null || v === '') return null;
    const n = typeof v === 'number' ? v : Number.parseInt(String(v), 10);
    return Number.isFinite(n) ? n : null;
  });

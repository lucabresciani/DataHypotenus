/**
 * Errori di dominio. Il layer HTTP li traduce in risposte JSON coerenti:
 * { error: { code, message, details? } }.
 *
 * Regola: i service lanciano AppError, non oggetti Fastify. Cosi' la logica di
 * dominio resta utilizzabile anche da CLI o da futuri altri trasporti.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what: string, id?: unknown): AppError =>
  new AppError(404, 'not_found', id === undefined ? `${what} non trovato` : `${what} non trovato (${String(id)})`);

export const badRequest = (message: string, details?: unknown): AppError =>
  new AppError(400, 'bad_request', message, details);

export const conflict = (message: string, details?: unknown): AppError =>
  new AppError(409, 'conflict', message, details);

export const unprocessable = (message: string, details?: unknown): AppError =>
  new AppError(422, 'unprocessable', message, details);

export const internal = (message: string, details?: unknown): AppError =>
  new AppError(500, 'internal_error', message, details);

/** Traduce i vincoli SQLite in messaggi comprensibili all'utente. */
export function translateSqliteError(err: unknown, context: string): AppError {
  if (err instanceof AppError) return err;
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('UNIQUE constraint failed')) {
    return conflict(`${context}: esiste già un elemento con questi valori`, { sqlite: message });
  }
  if (message.includes('FOREIGN KEY constraint failed')) {
    return conflict(`${context}: riferimento inesistente, oppure l'elemento e' ancora usato altrove`, {
      sqlite: message,
    });
  }
  if (message.includes('CHECK constraint failed')) {
    return unprocessable(`${context}: valore non ammesso`, { sqlite: message });
  }
  if (message.includes('NOT NULL constraint failed')) {
    return unprocessable(`${context}: campo obbligatorio mancante`, { sqlite: message });
  }
  return internal(`${context}: errore del database`, { sqlite: message });
}

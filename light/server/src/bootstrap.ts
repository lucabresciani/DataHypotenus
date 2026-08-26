/**
 * Sequenza di avvio condivisa da server e CLI:
 *   directory dei dati -> connessione -> migrazioni -> seed iniziale.
 * Averla in un punto solo evita che uno script CLI lavori su un database
 * con lo schema vecchio.
 */
import { config, ensureDataDirs } from './config.ts';
import { initDb, type Db } from './db/connection.ts';
import { migrate, schemaVersion } from './db/migrator.ts';
import { seedStarterData } from './db/seed.ts';
import { createLogger } from './core/logger.ts';

const log = createLogger('bootstrap');

export type BootstrapOptions = { seed?: boolean; dbPath?: string };

export function bootstrap(options: BootstrapOptions = {}): Db {
  ensureDataDirs();
  const db = initDb(options.dbPath ?? config.dbPath);

  const result = migrate(db);
  if (result.alreadyUpToDate) log.debug(`schema già aggiornato (versione ${result.currentVersion})`);

  // Il seed parte solo su database vuoto: non sovrascrive mai dati reali.
  if (options.seed !== false) {
    const seeded = seedStarterData(db);
    if (seeded.applied) log.info('database vuoto: applicate categorie e posizioni iniziali');
  }

  log.debug(`versione schema: ${schemaVersion(db)}`);
  return db;
}

/** CLI: applica le migrazioni pendenti. Uso: npm run migrate */
import { config, ensureDataDirs } from '../config.ts';
import { initDb, closeDb } from '../db/connection.ts';
import { migrate, appliedMigrations } from '../db/migrator.ts';

ensureDataDirs();
const db = initDb(config.dbPath);
const result = migrate(db);

if (result.alreadyUpToDate) {
  console.log(`Schema già aggiornato (versione ${result.currentVersion}).`);
} else {
  console.log(`Applicate ${result.applied.length} migrazioni -> versione ${result.currentVersion}.`);
}
console.table(appliedMigrations(db));
closeDb();

/** CLI: inserisce categorie/posizioni/tag iniziali. Uso: npm run seed [-- --force] */
import { bootstrap } from '../bootstrap.ts';
import { closeDb, getDb } from '../db/connection.ts';
import { seedStarterData } from '../db/seed.ts';

const force = process.argv.includes('--force');
bootstrap({ seed: false });
const result = seedStarterData(getDb(), force);

if (result.applied) {
  console.log(`Seed applicato: ${result.categories} categorie, ${result.locations} posizioni, ${result.tags} tag.`);
} else {
  console.log(`Seed non applicato (${result.reason}). Usare --force per inserirlo comunque.`);
}
closeDb();

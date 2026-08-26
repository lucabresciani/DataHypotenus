/**
 * CLI di manutenzione dello store allegati. Uso:
 *   npm run gc                 rimuove i file non piu' referenziati
 *   npm run gc -- --dry-run    simula senza cancellare
 *   npm run gc -- --check      verifica presenza e integrita' dei file
 */
import { bootstrap } from '../bootstrap.ts';
import { closeDb } from '../db/connection.ts';
import { checkStorage, collectGarbage } from '../modules/attachments.service.ts';

const args = process.argv.slice(2);
bootstrap({ seed: false });

if (args.includes('--check')) {
  console.log(JSON.stringify(checkStorage(true), null, 2));
} else {
  const report = collectGarbage(args.includes('--dry-run'));
  console.log(
    `${report.removed_files} blob rimossi, ${(report.freed_bytes / 1024).toFixed(1)} KB liberati` +
      (report.missing_on_disk.length ? `, ${report.missing_on_disk.length} file già assenti` : ''),
  );
}

closeDb();

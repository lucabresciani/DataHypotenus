/**
 * CLI dei backup. Uso:
 *   npm run backup                      crea un backup
 *   npm run backup -- --list            elenca i backup
 *   npm run backup -- --verify <nome>   verifica l'integrita'
 *   npm run backup -- --restore <nome>  ripristina (con copia di sicurezza)
 */
import { bootstrap } from '../bootstrap.ts';
import { closeDb } from '../db/connection.ts';
import { createBackup, listBackups, restoreBackup, verifyBackup } from '../modules/backup.service.ts';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : (args[index + 1] ?? '');
};

bootstrap({ seed: false });

if (args.includes('--list')) {
  console.table(listBackups());
} else if (args.includes('--verify')) {
  const name = flag('--verify');
  if (!name) throw new Error('Indicare il nome del backup: --verify <nome>');
  console.log(JSON.stringify(verifyBackup(name), null, 2));
} else if (args.includes('--restore')) {
  const name = flag('--restore');
  if (!name) throw new Error('Indicare il nome del backup: --restore <nome>');
  console.log(JSON.stringify(restoreBackup(name, { dryRun: args.includes('--dry-run') }), null, 2));
} else {
  const info = createBackup(flag('--label'));
  console.log(`Backup creato: ${info.name} (${info.files} allegati, ${(info.bytes / 1024).toFixed(1)} KB)`);
}

closeDb();

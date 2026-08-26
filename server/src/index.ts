/**
 * Punto di ingresso del server datahypotenus.
 *
 * Avvio: node src/index.ts  (Node 24 esegue TypeScript nativamente: nessuna
 * compilazione, nessun bundler lato server).
 */
import { config } from './config.ts';
import { bootstrap } from './bootstrap.ts';
import { buildApp } from './http/app.ts';
import { closeDb } from './db/connection.ts';
import { closeLogger, createLogger } from './core/logger.ts';
import { autoBackupIfNeeded } from './modules/backup.service.ts';

const log = createLogger('server');

async function main(): Promise<void> {
  const db = bootstrap();

  // Rete di sicurezza: se l'ultimo backup e' vecchio, se ne fa uno all'avvio.
  try {
    const backup = autoBackupIfNeeded(db);
    if (backup) log.info(`backup automatico creato: ${backup.name}`);
  } catch (err) {
    log.error('backup automatico fallito (avvio comunque proseguito)', err);
  }

  const app = await buildApp();
  await app.listen({ host: config.host, port: config.port });

  const url = `http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`;
  log.info(`datahypotenus pronto su ${url}`);
  log.info(`dati in ${config.dataDir}`);
  if (config.host !== '127.0.0.1' && config.host !== 'localhost') {
    log.warn(`il server ascolta su ${config.host}: raggiungibile da altri dispositivi della rete`);
  }

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`arresto in corso (${signal})`);
    try {
      await app.close();
      closeDb();
    } catch (err) {
      log.error('arresto non pulito', err);
    } finally {
      closeLogger();
      process.exit(0);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  log.error('avvio fallito', err);
  closeLogger();
  process.exit(1);
});

/**
 * Isolamento dei test.
 *
 * Caricato con `node --test --import ./test/setup.ts`: viene eseguito PRIMA dei
 * moduli del test, quindi fa in tempo ad assegnare una DATA_DIR temporanea.
 * Ogni file di test gira in un processo suo, quindi ottiene database, store
 * allegati e cartella backup separati. Nessun test tocca i dati reali.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'datahypotenus-test-'));

process.env.DH_DATA_DIR = dir;
process.env.NODE_ENV = 'test';
process.env.DH_AUTO_BACKUP_HOURS = '0';
process.env.DH_LOG_LEVEL = 'error';

process.on('exit', () => {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Su Windows il file del database puo' restare bloccato qualche istante:
    // e' una cartella temporanea, la pulizia non e' critica.
  }
});

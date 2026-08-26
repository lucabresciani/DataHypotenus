/**
 * Spegne datahypotenus.
 *
 * Serve quando la finestra del server e' stata persa di vista: trova il
 * processo che tiene occupata la porta e lo chiude, insieme alla finestra che
 * lo ospita. Il modo normale resta chiudere la finestra "datahypotenus" nella
 * barra delle applicazioni.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function leggiPorta() {
  const envFile = path.join(ROOT, '.env');
  if (fs.existsSync(envFile)) {
    const riga = fs
      .readFileSync(envFile, 'utf8')
      .split('\n')
      .find((line) => /^\s*DH_PORT\s*=/.test(line));
    const valore = Number.parseInt(riga?.split('=')[1]?.trim() ?? '', 10);
    if (Number.isFinite(valore)) return valore;
  }
  return 8787;
}

const porta = leggiPorta();

/** `netstat` elenca chi ascolta: da li' si ricava il PID. */
function pidInAscolto() {
  const uscita = execSync('netstat -ano -p TCP', { encoding: 'utf8' });
  for (const riga of uscita.split('\n')) {
    const campi = riga.trim().split(/\s+/);
    if (campi.length >= 5 && campi[3] === 'LISTENING' && campi[1]?.endsWith(`:${porta}`)) {
      return Number.parseInt(campi[4] ?? '', 10);
    }
  }
  return null;
}

/** Il server gira dentro una finestra `cmd`: va chiusa anche quella. */
function processoPadre(pid) {
  try {
    const uscita = execSync(
      `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').ParentProcessId"`,
      { encoding: 'utf8' },
    );
    const padre = Number.parseInt(uscita.trim(), 10);
    return Number.isFinite(padre) ? padre : null;
  } catch {
    return null;
  }
}

function nomeProcesso(pid) {
  try {
    const uscita = execSync(`tasklist /FI "PID eq ${pid}" /NH /FO CSV`, { encoding: 'utf8' });
    return uscita.split(',')[0]?.replaceAll('"', '').trim().toLowerCase() ?? '';
  } catch {
    return '';
  }
}

function chiudi(pid) {
  execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
}

/** Finestre rimaste aperte e vuote da un arresto precedente. */
function spazzaFinestre() {
  try {
    execSync('taskkill /FI "WINDOWTITLE eq datahypotenus*" /T /F', { stdio: 'ignore' });
  } catch {
    // Nessuna finestra da chiudere: va benissimo.
  }
}

const pid = pidInAscolto();

if (!pid) {
  spazzaFinestre();
  console.log(`Nessun server in ascolto sulla porta ${porta}: datahypotenus e' gia' spento.`);
  process.exit(0);
}

try {
  // Si parte dal padre, se e' la finestra `cmd` che lo ospita: chiudendo quella
  // se ne va anche il server, e non resta una console vuota sullo schermo.
  const padre = processoPadre(pid);
  chiudi(padre && nomeProcesso(padre) === 'cmd.exe' ? padre : pid);
  spazzaFinestre();
  console.log(`datahypotenus fermato (porta ${porta}).`);
} catch {
  console.error(`Non sono riuscito a fermare il processo ${pid}. Prova a chiudere la finestra "datahypotenus".`);
  process.exitCode = 1;
}

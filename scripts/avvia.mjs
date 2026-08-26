/**
 * Lanciatore di datahypotenus: quello che sta dietro all'icona sul desktop.
 *
 * Cosa fa, in ordine:
 *   1. guarda se il server risponde gia'. Se si', apre il browser e finisce
 *      qui: premere l'icona due volte non deve avviare due server.
 *   2. se manca `node_modules` o la build dell'interfaccia, le prepara.
 *   3. avvia il server in una finestra ridotta a icona, intitolata: chiuderla
 *      spegne l'applicazione. Niente processi invisibili da cercare nel
 *      gestore attivita'.
 *   4. aspetta che risponda davvero, poi apre il browser.
 *
 * Se qualcosa va storto, il messaggio resta a schermo: la finestra non
 * sparisce lasciando l'utente senza sapere cos'e' successo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AVVIO_MAX_MS = 60_000;

/** La porta viene dal .env, se c'e', altrimenti e' quella predefinita. */
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

const PORTA = leggiPorta();
const INDIRIZZO = `http://127.0.0.1:${PORTA}`;

const attendi = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function rispondeGia() {
  try {
    const risposta = await fetch(`${INDIRIZZO}/api/v1/health`, { signal: AbortSignal.timeout(1500) });
    if (!risposta.ok) return false;
    const dati = await risposta.json();
    return dati?.app === 'datahypotenus';
  } catch {
    return false;
  }
}

function eseguiOra(comando, argomenti, descrizione) {
  console.log(`  ${descrizione}...`);
  const esito = spawnSync(comando, argomenti, { cwd: ROOT, stdio: 'inherit', shell: true });
  if (esito.status !== 0) throw new Error(`${descrizione}: non riuscito`);
}

/**
 * `windowsVerbatimArguments`: senza, Node protegge le virgolette e `cmd` si
 * ritrova un titolo di finestra pieno di barre rovesciate. Qui la riga di
 * comando va passata esattamente com'e' scritta.
 */
function cmd(riga) {
  spawn('cmd.exe', ['/c', riga], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    windowsVerbatimArguments: true,
  }).unref();
}

function apriBrowser() {
  // Il primo argomento di `start` e' il titolo della finestra: senza, un
  // indirizzo fra virgolette verrebbe scambiato per quello.
  cmd(`start "" "${INDIRIZZO}"`);
}

function avviaServer() {
  // `/k` invece di `/c`: se il server si ferma con un errore, la finestra resta
  // aperta con scritto perche'. Il titolo serve a ritrovarla nella barra.
  cmd('start "datahypotenus" /min cmd /k node server\\src\\index.ts');
}

async function main() {
  console.log('datahypotenus\n');

  if (await rispondeGia()) {
    console.log(`Il server e' gia' attivo su ${INDIRIZZO}: apro l'applicazione.`);
    apriBrowser();
    return;
  }

  if (!fs.existsSync(path.join(ROOT, 'node_modules'))) {
    eseguiOra('npm', ['install'], 'Prima installazione delle dipendenze (ci vuole qualche minuto)');
  }

  if (!fs.existsSync(path.join(ROOT, 'web', 'dist', 'index.html'))) {
    eseguiOra('npm', ['run', 'build'], "Compilazione dell'interfaccia");
  }

  console.log(`Avvio del server su ${INDIRIZZO}`);
  avviaServer();

  const scadenza = Date.now() + AVVIO_MAX_MS;
  while (Date.now() < scadenza) {
    await attendi(400);
    if (await rispondeGia()) {
      console.log("Pronto. Apro l'applicazione nel browser.\n");
      console.log('Per spegnere datahypotenus, chiudi la finestra "datahypotenus" nella barra delle applicazioni.');
      apriBrowser();
      return;
    }
  }

  throw new Error(
    `Il server non ha risposto entro ${AVVIO_MAX_MS / 1000} secondi.\n` +
      'Guarda la finestra "datahypotenus" nella barra delle applicazioni: contiene il motivo.',
  );
}

main().catch((errore) => {
  console.error(`\nNon sono riuscito ad avviare datahypotenus.\n\n${errore.message}\n`);
  process.exitCode = 1;
});

# Architettura

## Principio guida

L'applicazione deve poter girare per anni su un computer di casa senza manutenzione, e
sopravvivere a un cambio di macchina con un copia-incolla. Da qui discende tutto il resto:
poche dipendenze, un solo processo, dati in chiaro su filesystem, nessun servizio esterno.

## Vista d'insieme

```
                        ┌───────────────────────────────┐
   browser              │  web/  (React + Vite)         │
   localhost:8787  ───► │  pagine → componenti → lib/api│
                        └──────────────┬────────────────┘
                                       │ fetch /api/v1/*
                        ┌──────────────▼────────────────┐
                        │  http/    rotte + validazione │  ← nessun SQL qui
                        ├───────────────────────────────┤
                        │  modules/ service (dominio)   │  ← nessun HTTP qui
                        │           repository (SQL)    │
                        ├───────────────────────────────┤
                        │  db/      connessione, migr.  │  ← unico punto SQLite
                        └──────┬─────────────────┬──────┘
                               ▼                 ▼
                     datahypotenus.db      attachments/
```

### Regole di separazione

| Livello | Può | Non può |
|---|---|---|
| `http/routes` | validare input, chiamare service, formattare risposte | scrivere SQL, contenere regole di dominio |
| `modules/*.service` | applicare regole, orchestrare, lanciare `AppError` | conoscere Fastify, request, response |
| `modules/items.repository` | scrivere SQL | contenere regole di dominio |
| `db/` | aprire la connessione, applicare migrazioni | conoscere il dominio |
| `web/pages` | comporre l'interfaccia | contenere logica di dominio (sta in `lib/`) |

Il rispetto di queste regole è verificabile a occhio: se in una rotta compare la parola
`SELECT`, qualcosa è finito nel posto sbagliato.

## Il flusso di una richiesta

Esempio: l'utente cambia la quantità di un oggetto dall'inventario.

1. `ItemRow.tsx` chiama `api.adjustQuantity(id, -1)`.
2. `lib/api.ts` fa `POST /api/v1/items/42/quantity` e, in caso di errore, lancia `ApiError`
   con un messaggio già leggibile.
3. `items.routes.ts` valida i parametri con Zod e chiama `adjustQuantity()`.
4. `items.service.ts` legge la quantità attuale, calcola la nuova (mai sotto zero), aggiorna
   e registra un evento in `item_events`. Tutto dentro una transazione.
5. La risposta è l'oggetto aggiornato, nella stessa forma che l'interfaccia già conosce.
6. TanStack Query invalida `['items']` e `['dashboard']`: le liste e i contatori del menu si
   aggiornano da soli.

## Scelte tecniche principali

| Ambito | Scelta | In breve |
|---|---|---|
| Runtime | Node.js 24 | Esegue TypeScript nativamente: niente build del server, niente bundler |
| Database | SQLite via `node:sqlite` | Modulo di serie: nessuna dipendenza nativa da compilare |
| Backend | Fastify 5 + Zod 4 | Leggero, validazione esplicita, gestione errori centralizzata |
| Frontend | React 19 + Vite + TanStack Query | Standard, build statica servita dal backend |
| Stile | CSS scritto a mano con design token | Nessun framework, nessun font remoto: funziona offline |
| Migrazioni | Runner SQL custom (~120 righe) | File `.sql` leggibili, applicabili anche a mano |
| Test | `node --test` | Nessuna dipendenza di test |

Le motivazioni estese, con le alternative valutate, sono in [DECISIONS.md](DECISIONS.md).

## Dipendenze

Runtime del server: `fastify`, `@fastify/cors`, `@fastify/multipart`, `@fastify/static`, `zod`.
Interfaccia: `react`, `react-dom`, `react-router-dom`, `@tanstack/react-query`.
Sviluppo: `typescript`, `vite`, `@vitejs/plugin-react`, i tipi.

Nessuna dipendenza nativa. `npm install` non compila nulla.

## Filesystem

```
data/                        DH_DATA_DIR, tutto ciò che è persistente
├── datahypotenus.db         database (+ .db-wal, .db-shm durante l'uso)
├── attachments/
│   └── ab/cd/<sha256>.pdf   blob indirizzati dal contenuto
├── backups/
│   └── 20260826-143012/
│       ├── datahypotenus.db
│       ├── attachments/
│       └── manifest.json    hash di ogni file, per la verifica
├── logs/app.log             log applicativo (rotazione a 5 MB, 3 copie)
└── tmp/
```

Il database non contiene i file: contiene i riferimenti. Il motivo è in
[DECISIONS.md → D-05](DECISIONS.md).

## Gestione degli errori

- I service lanciano `AppError(statusCode, code, message, details)`.
- I vincoli SQLite vengono tradotti in messaggi comprensibili
  (`translateSqliteError`): "esiste già un elemento con questi valori" invece di
  `SQLITE_CONSTRAINT_UNIQUE`.
- Il gestore centrale di Fastify produce sempre `{ error: { code, message, details } }`.
- L'interfaccia mostra il messaggio in una notifica o in un riquadro d'errore, con un
  pulsante "Riprova". Nessuna schermata bianca: ogni pagina ha stato di caricamento, stato
  vuoto e stato d'errore.
- I dettagli tecnici finiscono nel log, non a schermo.

## Logging

`core/logger.ts`: console leggibile durante l'uso, file JSON per riga in `data/logs/app.log`
con rotazione a dimensione. Livelli `debug|info|warn|error`, impostabili con `DH_LOG_LEVEL`.
Vengono registrati avvio e arresto, migrazioni applicate, backup, garbage collection dei file,
errori 5xx. Non viene registrata ogni richiesta HTTP: sarebbe rumore.

## Prestazioni

Per un inventario domestico (ordine di grandezza: migliaia di record) il collo di bottiglia
non esiste. Le scelte fatte comunque:

- indici su tutte le colonne usate nei filtri e negli ordinamenti;
- **FTS5** per la ricerca testuale, sincronizzato da trigger: la ricerca resta immediata anche
  con decine di migliaia di oggetti;
- statement SQL preparati e riutilizzati (cache in `Db`);
- `PRAGMA journal_mode = WAL`: letture e scritture non si bloccano a vicenda;
- una sola richiesta alimenta dashboard e contatori del menu.

## Estensioni previste dall'architettura

Cose che si possono aggiungere senza toccare le fondamenta:

- **manutenzioni**: tabella `maintenance_records` già presente, manca solo l'interfaccia;
- **QR code**: `items.uid` e `locations.code` esistono già; serve una pagina di stampa e uno
  scanner;
- **accesso dalla LAN**: `DH_HOST=0.0.0.0`, il resto è già pronto;
- **autenticazione**: un hook `preHandler` in `http/app.ts`;
- **allegati su altre entità**: `attachments` è già polimorfico.

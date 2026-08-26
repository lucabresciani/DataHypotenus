# datahypotenus

Il database personale della casa: cosa possiedo, dove sta, quanto è costato, quando l'ho
comprato, se è ancora in garanzia, quali documenti ha, e cosa manca ancora.

Applicazione **locale**, **offline**, **senza cloud**. Un solo processo Node, un file SQLite,
una cartella di dati che si può copiare da una macchina all'altra.

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (localhost)                                          │
│     Dashboard · Inventario · Categorie · Posizioni            │
│     Acquisti · Scadenze · Statistiche · Impostazioni          │
└───────────────────────────┬──────────────────────────────────┘
                            │  HTTP su 127.0.0.1
┌───────────────────────────▼──────────────────────────────────┐
│  server Node 24 (Fastify)  →  data/datahypotenus.db          │
│                            →  data/attachments/  (foto, PDF) │
│                            →  data/backups/                  │
└──────────────────────────────────────────────────────────────┘
```

---

## Requisiti

- **Node.js 24 o superiore** (`node --version`). Serve la versione 24 perché il server usa
  due funzionalità native: l'esecuzione diretta di TypeScript e il modulo `node:sqlite`.
- Nient'altro. Nessun database da installare, nessun Docker, nessuna compilazione nativa.

## Installazione

```bash
npm install
```

## Avvio

**Uso normale** (interfaccia e API sullo stesso indirizzo):

```bash
npm run build     # compila l'interfaccia (solo la prima volta e dopo ogni modifica al codice)
npm start         # avvia il server
```

Poi apri **http://127.0.0.1:8787**.

**Sviluppo** (ricarica automatica di frontend e backend):

```bash
npm run dev       # server su :8787, interfaccia su :5173
```

e apri **http://localhost:5173**.

## Comandi disponibili

| Comando | Cosa fa |
|---|---|
| `npm run dev` | Avvia backend e frontend in sviluppo, con ricarica automatica |
| `npm run build` | Controlla i tipi di server e interfaccia, e compila l'interfaccia in `web/dist` |
| `npm start` | Avvia l'applicazione (usa l'interfaccia compilata) |
| `npm test` | Esegue la suite di test del server |
| `npm run typecheck` | Controllo dei tipi su server e interfaccia |
| `npm run migrate` | Applica le migrazioni del database e mostra quelle applicate |
| `npm run seed` | Inserisce categorie/posizioni iniziali (`-- --force` per farlo comunque) |
| `npm run backup` | Crea un backup. `-- --list`, `-- --verify <nome>`, `-- --restore <nome>` |
| `npm run gc` | Rimuove i file allegati non più referenziati. `-- --check` verifica l'integrità |

## Struttura del progetto

```
datahypotenus/
├── server/                  backend: API, dominio, database
│   ├── src/
│   │   ├── index.ts         punto di ingresso
│   │   ├── config.ts        configurazione (percorsi, porta, log)
│   │   ├── bootstrap.ts     avvio: cartelle → connessione → migrazioni → seed
│   │   ├── core/            errori, log, date, id, CSV
│   │   ├── db/              connessione, migrazioni SQL, alberi, seed
│   │   ├── modules/         un modulo per area: items, categories, locations,
│   │   │                    tags, statuses, vendors, attachments, shopping,
│   │   │                    dashboard, stats, backup, transfer, settings
│   │   ├── http/            server HTTP, validazione, rotte
│   │   └── cli/             script da riga di comando
│   └── test/                test (node --test)
├── web/                     interfaccia React
│   └── src/
│       ├── lib/             client API, tipi, formattazione
│       ├── components/      layout, form, tabelle, primitive UI
│       ├── pages/           una pagina per sezione
│       └── styles/          design tokens e fogli di stile
├── docs/                    documentazione (vedi sotto)
├── scripts/                 utilità di sviluppo
└── data/                    TUTTI i dati (creata al primo avvio, mai versionata)
    ├── datahypotenus.db     database SQLite
    ├── attachments/         foto e documenti
    ├── backups/             backup completi
    └── logs/                log applicativi
```

## Dove stanno i miei dati

Tutto in `data/`, nella radice del progetto. Per spostare l'applicazione su un altro computer
basta copiare quella cartella. Per tenerla altrove (per esempio su un altro disco) si imposta
`DH_DATA_DIR` — vedi [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

Il database è un normale file SQLite: si può aprire con qualunque strumento (`sqlite3`,
DB Browser for SQLite) anche senza questa applicazione.

## Documentazione

| Documento | Contenuto |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Come è fatto il sistema, dove sta ogni responsabilità |
| [docs/DATABASE.md](docs/DATABASE.md) | Schema completo, relazioni, migrazioni |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decisioni architetturali con motivazioni e alternative |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | Variabili d'ambiente e impostazioni |
| [docs/BACKUP.md](docs/BACKUP.md) | Backup, ripristino, verifica di integrità |
| [docs/IMPORT-EXPORT.md](docs/IMPORT-EXPORT.md) | Formati CSV e JSON, regole di import |
| [docs/API.md](docs/API.md) | Endpoint HTTP |
| [docs/DEPLOY-LINUX.md](docs/DEPLOY-LINUX.md) | Migrazione su un mini-PC Linux, servizio systemd |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Stato delle funzionalità e sviluppi successivi |

## Sicurezza e privacy

- Il server ascolta **solo su `127.0.0.1`**: non è raggiungibile dalla rete finché non lo si
  decide esplicitamente (`DH_HOST=0.0.0.0`).
- Nessuna chiamata verso internet durante il normale utilizzo. Nessuna telemetria.
- Nessun segreto nel codice: la configurazione passa da variabili d'ambiente o dal file `.env`.
- Non c'è autenticazione, perché non serve a un'applicazione che ascolta solo sul computer
  locale. Prima di esporla in LAN, leggi [docs/DEPLOY-LINUX.md](docs/DEPLOY-LINUX.md).

## Licenza

MIT.

# Configurazione

Due livelli, con scopi diversi:

- **Configurazione di deploy** — dove stanno i dati, su quale porta ascoltare, quanto loggare.
  Sta nelle variabili d'ambiente (o nel file `.env`), perché cambia da macchina a macchina.
- **Preferenze d'uso** — valuta, soglie di avviso, dimensione delle pagine. Stanno nel
  database (Impostazioni → Generale), perché devono seguire i dati quando si spostano.

## Variabili d'ambiente

Copia `.env.example` in `.env` nella radice del progetto e modifica solo ciò che serve: ogni
valore ha un default sensato.

| Variabile | Default | Descrizione |
|---|---|---|
| `DH_DATA_DIR` | `./data` | Cartella con database, allegati, backup e log. Relativa alla radice del progetto oppure assoluta |
| `DH_HOST` | `127.0.0.1` | Interfaccia di ascolto. `0.0.0.0` espone l'app alla rete locale |
| `DH_PORT` | `8787` | Porta HTTP |
| `DH_CORS_ORIGINS` | *(vuoto)* | Origini extra ammesse dal browser, separate da virgola. Il server Vite di sviluppo è già ammesso |
| `DH_LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |
| `DH_MAX_UPLOAD_MB` | `50` | Dimensione massima di un singolo allegato |
| `DH_AUTO_BACKUP_HOURS` | `24` | Backup automatico all'avvio se l'ultimo è più vecchio di N ore. `0` disattiva |
| `DH_BACKUP_KEEP` | `10` | Quanti backup conservare (i più vecchi vengono rimossi) |

Le variabili si possono passare anche direttamente:

```bash
# Windows (PowerShell)
$env:DH_PORT = "9000"; npm start

# Linux / macOS
DH_PORT=9000 DH_DATA_DIR=/var/lib/datahypotenus npm start
```

### Esempi

**Dati su un altro disco** (utile se il progetto sta sull'SSD di sistema ma vuoi i dati altrove):

```ini
DH_DATA_DIR=D:/Archivio/datahypotenus-data
```

**Accesso dal telefono sulla rete di casa** (leggi prima
[DEPLOY-LINUX.md → sicurezza](DEPLOY-LINUX.md)):

```ini
DH_HOST=0.0.0.0
```

**Diagnostica di un problema:**

```ini
DH_LOG_LEVEL=debug
```

## Preferenze nel database

Impostazioni → Generale, oppure `PUT /api/v1/settings`. La sola `backup.keep` sta in
Impostazioni → Backup → *Rotazione*, insieme al resto dei backup.

| Chiave | Default | Effetto |
|---|---|---|
| `app.default_currency` | `EUR` | Valuta proposta sui nuovi oggetti e usata negli aggregati |
| `app.default_unit` | `pz` | Unità di misura proposta |
| `alerts.warranty_days` | `60` | Entro quanti giorni una garanzia è "in scadenza" |
| `alerts.expiration_days` | `30` | Entro quanti giorni una scadenza è "imminente" |
| `alerts.dashboard_limit` | `8` | Righe mostrate in ogni riquadro della dashboard |
| `backup.keep` | `10` | Backup conservati, in Impostazioni → Backup (equivalente a `DH_BACKUP_KEEP`) |
| `inventory.page_size` | `50` | Oggetti per pagina nell'inventario |

## Struttura della cartella dati

```
data/
├── datahypotenus.db      il database
├── datahypotenus.db-wal  journal WAL (normale durante l'uso)
├── datahypotenus.db-shm  memoria condivisa WAL
├── attachments/          foto e documenti
├── backups/              backup completi
├── logs/app.log          log applicativo (+ app.log.1, .2, .3 ruotati)
└── tmp/
```

`data/` è esclusa da git. **È l'unica cartella da salvare**: contiene tutto.

## Porte già occupate

Se l'avvio fallisce con `EADDRINUSE`, la porta 8787 è già usata da un altro programma (o da
un'altra istanza di datahypotenus rimasta aperta):

```bash
# Windows: chi sta usando la porta
netstat -ano | findstr :8787

# Linux
ss -tlnp | grep 8787
```

Oppure semplicemente cambia porta con `DH_PORT`.

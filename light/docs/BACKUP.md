# Backup e ripristino

> Il database **non** è l'unica cosa da salvare: senza gli allegati resterebbero le ricevute
> senza i file. Ogni backup di datahypotenus contiene entrambi.

## Cos'è un backup

Una cartella dentro `data/backups/`, chiamata con la data e l'ora:

```
data/backups/20260826-143012/
├── datahypotenus.db      copia consistente del database
├── attachments/          copia di tutti gli allegati registrati
│   └── ab/cd/<sha256>.pdf
└── manifest.json         hash SHA-256 di ogni file, conteggi, versione schema
```

Non è un archivio compresso: è una cartella normale. Si può aprire, ispezionare e — se un
giorno questa applicazione non esistesse più — recuperare a mano semplicemente copiando i file
al loro posto.

La copia del database è fatta con `VACUUM INTO`, che produce un file consistente e compattato
anche mentre il server è acceso e sta scrivendo.

## Quando viene creato

| Occasione | Come |
|---|---|
| All'avvio, se l'ultimo backup è più vecchio di 24 ore | Automatico (`DH_AUTO_BACKUP_HOURS`) |
| Prima di ogni ripristino | Automatico, etichettato `pre-restore-...` |
| Quando vuoi | Impostazioni → Backup → *Crea backup adesso*, o `npm run backup` |

I backup vecchi vengono rimossi automaticamente conservando gli ultimi `DH_BACKUP_KEEP`
(default 10). **I backup di sicurezza pre-ripristino non vengono mai rimossi in automatico.**

## Comandi

```bash
npm run backup                      # crea un backup adesso
npm run backup -- --list            # elenca i backup con dimensione e numero di allegati
npm run backup -- --verify 20260826-143012
npm run backup -- --restore 20260826-143012
npm run backup -- --restore 20260826-143012 --dry-run   # simula, non tocca nulla
```

Le stesse operazioni sono in Impostazioni → Backup.

## Verifica di integrità

La verifica ricalcola lo SHA-256 del database e di ogni allegato e lo confronta con il
manifest. Un backup che non passa la verifica **non può essere ripristinato**: l'operazione
viene rifiutata invece di sovrascrivere dati buoni con dati corrotti.

```bash
npm run backup -- --verify 20260826-143012
```

Vale la pena farlo ogni tanto sul backup più recente, e sempre prima di affidarsi a un backup
vecchio.

## Ripristino

Cosa succede, nell'ordine:

1. il backup viene verificato — se non è integro ci si ferma qui;
2. viene creato un backup dello **stato attuale** (`pre-restore-...`), così l'operazione è
   reversibile;
3. la connessione al database viene chiusa;
4. il file del database viene sostituito (compresi i file `-wal` e `-shm`);
5. gli allegati del backup vengono ricopiati al loro posto;
6. la connessione viene riaperta.

> Tutte le modifiche fatte **dopo** la data del backup vengono perse. È il senso di un
> ripristino, ma è bene saperlo: il backup pre-ripristino creato al punto 2 le contiene ancora.

## Ripristino manuale, senza l'applicazione

Se serve recuperare i dati con l'applicazione ferma (o inesistente):

```bash
# 1. Ferma il server.
# 2. Metti da parte la cartella dati attuale.
mv data data-vecchia

# 3. Ricostruiscila dal backup.
mkdir -p data
cp data-vecchia/backups/20260826-143012/datahypotenus.db data/
cp -r data-vecchia/backups/20260826-143012/attachments data/

# 4. Riavvia.
npm start
```

Il database è un file SQLite standard: si legge anche con `sqlite3` o DB Browser for SQLite.

## Copiare i backup fuori dal computer

Un backup sullo stesso disco protegge dagli errori, non dai guasti. Per la copia esterna
(chiavetta, disco USB, NAS) va bene qualunque strumento che copi cartelle:

```bash
# Linux/macOS
rsync -a --delete data/backups/ /mnt/nas/datahypotenus-backups/

# Windows
robocopy data\backups D:\Backup\datahypotenus /MIR
```

Volendo si può copiare direttamente l'intera `data/`: contiene già tutto.

## Manutenzione dei file allegati

Due operazioni in Impostazioni → Diagnostica (o da riga di comando):

```bash
npm run gc -- --check     # verifica che ogni file esista e che l'hash corrisponda
npm run gc -- --dry-run   # mostra cosa verrebbe eliminato
npm run gc                # elimina i file non più referenziati da nessun allegato
```

La garbage collection non parte mai da sola: un file sparisce solo quando lo si chiede
esplicitamente, e solo se **nessun** oggetto lo referenzia più.

## Cosa fare se qualcosa va storto

| Sintomo | Cosa fare |
|---|---|
| L'app non parte, errore sul database | `sqlite3 data/datahypotenus.db "PRAGMA integrity_check"`. Se non risponde `ok`, ripristina l'ultimo backup |
| Le foto non si vedono | Impostazioni → Diagnostica → *Verifica integrità*: mostra i file mancanti |
| Ho cancellato un oggetto per sbaglio | È nel Cestino, si ripristina con un clic (finché non lo si svuota) |
| Ho svuotato il cestino per sbaglio | Ripristina il backup precedente all'operazione |
| Il database è cresciuto molto | `npm run gc` per i file orfani; `sqlite3 data/datahypotenus.db "VACUUM"` per compattare |

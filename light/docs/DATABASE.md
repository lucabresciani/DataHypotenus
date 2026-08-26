# Database

SQLite, file unico in `data/datahypotenus.db`. Schema definito dalle migrazioni in
`server/src/db/migrations/`.

## Convenzioni

| Tipo | Rappresentazione | Esempio |
|---|---|---|
| Data | `TEXT` `AAAA-MM-GG` | `2026-03-15` |
| Timestamp | `TEXT` ISO-8601 UTC | `2026-03-15T09:12:44Z` |
| Booleano | `INTEGER` 0/1 | `is_consumable = 1` |
| Denaro | `REAL` + colonna `currency` | `1299.9`, `EUR` |

Il testo ISO per le date è ordinabile, confrontabile con `BETWEEN`, leggibile in un CSV e
indipendente dal fuso orario della macchina.

## Diagramma delle relazioni

```
       ┌───────────────┐                    ┌───────────────┐
       │  categories   │◄──┐             ┌─►│   locations   │◄──┐
       │  (albero)     │───┘ parent_id   │  │   (albero)    │───┘ parent_id
       └───────┬───────┘                 │  └───────┬───────┘
               │ category_id             │          │ location_id
               │        ┌────────────────┘          │
               ▼        ▼                           ▼
            ┌──────────────────────────────────────────┐
            │                 items                    │
            │  uid · quantità · prezzo · garanzia · ... │
            └──┬────┬─────┬──────────┬────────┬────────┘
               │    │     │          │        │ status_id
               │    │     │          │        └────────────► item_statuses
               │    │     │          │ vendor_id
               │    │     │          └───────────────────► vendors
               │    │     │
               │    │     └── item_tags ──────────────────► tags        (N:N)
               │    │
               │    └──────── item_events                  (cronologia)
               │
               └───────────── maintenance_records          (predisposto)

            attachments ──► files          (collegamento logico → blob fisico)
                 ▲
                 └── entity_type + entity_id  ('item' | 'location' | ...)

            shopping_items ──► items (item_id: creato alla conversione)
                           ──► items (source_item_id: consumabile da riordinare)

            settings (chiave/valore)      schema_migrations (versioni applicate)
```

## Tabelle

### `items` — gli oggetti

Il cuore del sistema. Colonne raggruppate per area:

| Area | Colonne |
|---|---|
| Identità | `id`, `uid` (pubblico, stabile), `name`, `description` |
| Classificazione | `category_id`, `location_id`, `status_id`, `vendor_id` |
| Inventario | `quantity`, `unit`, `is_consumable`, `min_quantity`, `initial_quantity` |
| Riconoscimento | `brand`, `model`, `serial_number`, `sku`, `barcode` |
| Economia | `purchase_price` (**unitario**), `current_value`, `currency`, `purchase_date`, `product_url` |
| Garanzia | `warranty_months`, `warranty_start`, `warranty_end`, `warranty_notes` |
| Scadenze | `expiration_date`, `expected_lifespan_months` |
| Altro | `notes`, `specs` (JSON), `is_favorite` |
| Sistema | `created_at`, `updated_at`, `deleted_at` |

**Solo `name` e `status_id` sono obbligatori.** Una padella non ha numero di serie né
garanzia; un portatile sì. Lo schema non impone campi che non hanno senso per tutti.

Note importanti:

- `purchase_price` è il prezzo **di un pezzo**. Il valore totale è `purchase_price × quantity`,
  calcolato, mai memorizzato: non può divergere.
- `warranty_end` viene calcolata da `purchase_date` (o `warranty_start`) + `warranty_months`
  se non specificata esplicitamente. Se la si scrive a mano, quella vince.
- `deleted_at` implementa il cestino: le viste normali filtrano `deleted_at IS NULL`.
- `specs` è un oggetto JSON per le specifiche libere (`{"RAM": "16 GB"}`), interrogabile con
  le funzioni JSON di SQLite se un giorno servirà.

### `categories` e `locations` — i due alberi

Stessa struttura: `id`, `parent_id`, `name`, ordinamento, timestamp. Profondità libera.

- **Categorie**: a cosa serve la cosa (Cucina → Pentole e padelle).
- **Posizioni**: dove sta fisicamente (Casa → Cucina → Mobile alto → Cassetto 2).
  La colonna `kind` distingue `building`, `floor`, `room`, `area`, `furniture`, `shelf`,
  `container`, `other`. **Un contenitore è una posizione**, non un'entità separata: vedi
  [DECISIONS.md → D-03](DECISIONS.md).
- `locations.code` è il codice stampabile da attaccare sulla scatola (futuro QR code).

Un indice unico impedisce due figli con lo stesso nome sotto lo stesso genitore. Un `CHECK`
impedisce che un nodo sia genitore di sé stesso; i cicli più lunghi sono impediti dal service.

### `item_statuses` — gli stati, configurabili

L'utente può rinominare, creare ed eliminare stati. Il codice non guarda mai l'etichetta ma
due flag:

- `counts_as_owned`: l'oggetto entra nei conteggi e nel valore dell'inventario;
- `is_wishlist`: l'oggetto compare fra le cose ancora da comprare.

Così "Posseduto" si può chiamare "A casa" senza rompere dashboard e statistiche. Gli stati
marcati `is_system` non si possono eliminare, e uno stato in uso può essere eliminato solo
indicando quello sostitutivo.

### `files` e `attachments` — i documenti

Due livelli:

- **`files`**: il blob fisico, identificato dallo `sha256` del contenuto, salvato in
  `attachments/<aa>/<bb>/<sha256>.<ext>`.
- **`attachments`**: il collegamento logico fra un blob e un'entità (`entity_type` +
  `entity_id`), con tipo (`photo`, `receipt`, `invoice`, `manual`, `warranty`, `other`).

Conseguenze pratiche:

- la stessa fattura allegata a due oggetti occupa **un solo file** su disco;
- cancellare un oggetto rimuove i suoi collegamenti, **non** i file condivisi con altri;
- un blob sparisce solo quando nessun allegato lo referenzia più, e solo su richiesta esplicita
  (`npm run gc`, oppure il pulsante in Impostazioni → Diagnostica);
- l'integrità è verificabile ricalcolando l'hash (`npm run gc -- --check`).

### `item_events` — la cronologia

Una riga per modifica rilevante: quantità, spostamento, cambio stato, prezzo, garanzia,
scadenza, creazione, cestino, ripristino. Registrata fin dalla prima versione perché è l'unico
dato che non si può ricostruire a posteriori.

### `shopping_items` — la lista acquisti

Entità separata dagli oggetti: un desiderio ha attributi propri (priorità, prezzo stimato,
link) e non deve inquinare i conteggi dell'inventario. Alla conversione nasce un `item` e il
legame resta in `item_id`. Se la voce è nata dal riordino di un consumabile, `source_item_id`
punta all'oggetto la cui scorta verrà ricaricata all'acquisto.

### `maintenance_records` — predisposta

Tabella presente, senza interfaccia nell'MVP: `item_id`, `kind`, `description`, `performed_at`,
`next_due_date`, `cost`, `provider`, `notes`. Creata subito perché il requisito era che lo
schema non impedisse la funzionalità.

### `settings` — preferenze

Chiave/valore. Sono le preferenze d'**uso** (valuta, soglie di avviso), che devono seguire il
database quando lo si sposta. La configurazione di **deploy** (porte, percorsi) sta invece
nelle variabili d'ambiente.

## Ricerca full-text

```sql
CREATE VIRTUAL TABLE items_fts USING fts5(
  name, description, brand, model, serial_number, sku, barcode, notes,
  content = 'items', content_rowid = 'id',
  tokenize = "unicode61 remove_diacritics 2"
);
```

Indice **esterno**: non duplica il contenuto, è mantenuto allineato da tre trigger. Il testo
digitato viene trasformato in una query per prefisso (`"tras"*` trova "trasloco") con le
virgolette che neutralizzano i caratteri speciali di FTS5, perché altrimenti cercare `-` o
`NEAR(` farebbe fallire la query.

Categoria, posizione, tag e negozio non stanno nell'indice: vengono cercati con `LIKE` sui
percorsi già calcolati, in `OR` con il full-text. Chi cerca "Cassetto 2" trova gli oggetti che
ci sono dentro.

## Viste dei percorsi

`category_paths` e `location_paths` calcolano con una CTE ricorsiva il percorso completo
("Casa / Cucina / Cassetto 2"), la profondità, la radice e — per le posizioni — la stanza di
appartenenza. Il percorso è **calcolato, non memorizzato**: rinominare "Cucina" aggiorna tutto
senza migrazioni di dati.

## Migrazioni

File `NNNN_nome.sql` applicati in ordine, una sola volta, ciascuno in una transazione. La
tabella `schema_migrations` registra versione, nome, checksum e data.

```bash
npm run migrate          # applica quelle mancanti e mostra lo stato
```

Regole:

1. **Una migrazione applicata non si modifica mai.** Se serve un cambiamento, si aggiunge un
   file nuovo. Il checksum registrato serve proprio a rilevare le violazioni: se un file
   applicato cambia, l'avvio si ferma con un messaggio esplicito invece di lasciare due
   macchine con schemi diversi.
2. Le migrazioni girano automaticamente all'avvio del server.
3. Sono SQL puro: si possono applicare a mano con `sqlite3 data/datahypotenus.db < file.sql`.

| Versione | File | Contenuto |
|---|---|---|
| 0001 | `0001_init.sql` | Tutte le tabelle, indici, trigger FTS, viste dei percorsi |
| 0002 | `0002_system_data.sql` | Stati di sistema e impostazioni predefinite |

## Ispezionare il database a mano

```bash
sqlite3 data/datahypotenus.db

.tables
.schema items
SELECT name, quantity, purchase_price FROM items WHERE deleted_at IS NULL LIMIT 10;
SELECT path FROM location_paths ORDER BY path;
PRAGMA integrity_check;
```

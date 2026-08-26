# Import ed export

Obiettivo dichiarato del progetto: **i dati sono tuoi e devono restare leggibili anche senza
questa applicazione**. Da qui due formati, entrambi aperti.

| Formato | Contiene | Quando usarlo |
|---|---|---|
| **CSV** | Una riga per oggetto, colonne piatte | Aprirlo in Excel/LibreOffice, importare un elenco già esistente |
| **JSON** | Tutto il database (tutte le tabelle) | Copia di riferimento, trasferimento su un'altra installazione |

Gli allegati **non** sono dentro l'export: sono file su disco e vengono inclusi nei
[backup](BACKUP.md).

## Esportare

Impostazioni → Import ed export, oppure direttamente:

```
http://127.0.0.1:8787/api/v1/export/csv
http://127.0.0.1:8787/api/v1/export/json
```

Il CSV è UTF-8 con BOM (così Excel su Windows non sbaglia gli accenti), separatore virgola,
virgolette secondo RFC 4180.

## Colonne del CSV

| Colonna | Note |
|---|---|
| `uid` | Identificatore stabile. **È la chiave di merge in import** |
| `name` | **Unica colonna obbligatoria** |
| `description` | |
| `category_path` | Percorso completo: `Cucina / Pentole e padelle` |
| `location_path` | Percorso completo: `Casa / Cucina / Cassetto 2` |
| `status` | Etichetta o chiave dello stato (`Posseduto`, `owned`) |
| `quantity`, `unit` | La virgola decimale è accettata (`1,5`) |
| `is_consumable` | `1`, `si`, `true`, `x` valgono vero |
| `min_quantity` | Soglia di riordino |
| `brand`, `model`, `serial_number`, `sku`, `barcode` | |
| `purchase_price`, `currency`, `purchase_date` | Prezzo **unitario**; data `AAAA-MM-GG` |
| `vendor` | Nome del negozio; se non esiste viene creato |
| `product_url` | |
| `warranty_months`, `warranty_start`, `warranty_end` | |
| `expiration_date` | |
| `tags` | Separati da `;` o `,` — `cucina; costoso` |
| `notes` | |
| `created_at`, `updated_at` | Presenti in export, ignorati in import |

Le colonne mancanti vengono semplicemente ignorate: un CSV con solo `name` e `quantity`
funziona.

## Importare

Impostazioni → Import ed export → trascina il file sull’area, o premila per sceglierlo. Vengono accettati sia CSV che JSON.

### Regole di merge

- La chiave è l'**`uid`**. Se la riga ha un `uid` già presente in archivio, l'oggetto viene
  **aggiornato**; se l'`uid` manca o è nuovo, viene **creato**.
  Conseguenza pratica: esportare e reimportare lo stesso file non duplica niente.
- `category_path` e `location_path` vengono risolti percorso per percorso; i nodi mancanti
  vengono **creati** al volo. Le posizioni intermedie nascono di tipo "Altro": si possono poi
  qualificare come stanza, mobile o contenitore dalla pagina Posizioni.
- Tag e negozi vengono creati se non esistono, riusati se esistono (confronto senza
  distinzione fra maiuscole e minuscole).
- Le righe senza nome vengono saltate.
- Un errore su una riga **non blocca le altre**: al termine il rapporto elenca riga per riga
  cosa non è andato.

### Modalità

| Modalità | Comportamento |
|---|---|
| `merge` (default) | Aggiorna gli oggetti esistenti, crea i nuovi |
| `create_only` | Salta gli oggetti già presenti, non li modifica |

Da API: `POST /api/v1/import/csv?mode=create_only`.

### Esempio minimo

```csv
name,category_path,location_path,quantity,purchase_price,tags
Set asciugamani,Bagno / Tessili,Casa / Bagno / Armadietto,4,29.90,bagno; tessili
Tostapane,Cucina / Elettrodomestici,Casa / Cucina,1,39.00,cucina
```

Questo file crea due oggetti, quattro categorie e quattro posizioni, e due tag.

### Rapporto di import

Al termine viene mostrato:

```
3 creati · 12 aggiornati · 1 saltato · 2 errori
Riga 7: Data non valida in "purchase_date": attesa nel formato AAAA-MM-GG
Riga 9: Il nome dell oggetto e obbligatorio
```

## Struttura del bundle JSON

```jsonc
{
  "meta": {
    "app": "datahypotenus",
    "format_version": 1,
    "schema_version": 2,
    "exported_at": "2026-08-26T12:00:00Z",
    "counts": { "items": 128, "categories": 41, ... }
  },
  "settings": { "app.default_currency": "EUR", ... },
  "statuses": [...], "categories": [...], "locations": [...],
  "vendors": [...], "tags": [...], "items": [...], "item_tags": [...],
  "shopping_items": [...], "attachments": [...], "files": [...],
  "maintenance_records": [...], "item_events": [...]
}
```

In import vengono usate le sezioni `items`, `categories`, `locations`, `statuses`, `tags` e
`item_tags`. Le sezioni `attachments` e `files` sono i **metadati** dei documenti: per
ripristinare anche i file serve un [backup](BACKUP.md), non un export.

## Estrarre i dati senza l'applicazione

Il database è un file SQLite standard:

```bash
sqlite3 -header -csv data/datahypotenus.db \
  "SELECT i.name, i.quantity, i.purchase_price, cp.path AS categoria, lp.path AS posizione
   FROM items i
   LEFT JOIN category_paths cp ON cp.id = i.category_id
   LEFT JOIN location_paths lp ON lp.id = i.location_id
   WHERE i.deleted_at IS NULL" > inventario.csv
```

I documenti allegati sono file normali in `data/attachments/`. Il nome è l'hash del contenuto;
per ritrovare quale documento è quale:

```sql
SELECT a.original_filename, a.kind, f.rel_path, i.name
FROM attachments a
JOIN files f ON f.id = a.file_id
JOIN items i ON i.id = a.entity_id AND a.entity_type = 'item';
```

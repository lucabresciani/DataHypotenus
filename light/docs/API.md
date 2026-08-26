# API HTTP

Base: `http://127.0.0.1:8787/api/v1`. Tutte le risposte sono JSON.

Errori, sempre nella stessa forma:

```jsonc
{
  "error": {
    "code": "validation_error",          // not_found | conflict | bad_request | internal_error ...
    "message": "Controlla i dati inseriti",
    "details": [{ "field": "name", "message": "Il nome e obbligatorio" }]
  }
}
```

## Diagnostica

| Metodo | Percorso | Descrizione |
|---|---|---|
| GET | `/health` | Stato, versione schema, integrità del database, percorsi |

## Oggetti

| Metodo | Percorso | Descrizione |
|---|---|---|
| GET | `/items` | Elenco filtrato (vedi filtri sotto) |
| POST | `/items` | Crea un oggetto |
| GET | `/items/:id` | Dettaglio |
| PATCH | `/items/:id` | Modifica parziale |
| DELETE | `/items/:id` | Nel cestino. `?purge=1` elimina definitivamente |
| POST | `/items/:id/restore` | Ripristina dal cestino |
| POST | `/items/:id/duplicate` | Duplica (tag inclusi, allegati esclusi) |
| POST | `/items/:id/quantity` | `{ "delta": -1 }` oppure `{ "value": 4 }` |
| POST | `/items/:id/restock` | Crea la voce in lista acquisti per un consumabile |
| GET | `/items/:id/history` | Cronologia degli eventi |
| GET | `/items/:id/attachments` | Allegati dell'oggetto |
| GET | `/items/uid/:uid` | Dettaglio per identificatore pubblico (utile per i QR code) |
| POST | `/items/bulk` | Azione su più oggetti |
| POST | `/items/trash/empty` | Svuota il cestino |

### Filtri di `/items`

`q`, `category_id`, `include_subcategories`, `location_id`, `include_sublocations`, `room_id`,
`status_ids`, `tag_ids`, `tags_mode` (`any`\|`all`), `vendor_id`, `brand`, `price_min`,
`price_max`, `purchased_from`, `purchased_to`, `is_consumable`, `below_min`, `warranty`
(`none`\|`active`\|`expiring`\|`expired`), `expiring_within_days`, `expired`,
`has_attachments`, `is_favorite`, `owned_only`, `wishlist_only`, `no_category`, `no_location`,
`trash` (`exclude`\|`include`\|`only`), `sort`, `direction`, `limit`, `offset`.

Le liste si passano separate da virgola: `?status_ids=1,3&tag_ids=5`.

Risposta: `{ items: [...], total, limit, offset, total_value }`.

### Azioni multiple

```jsonc
POST /items/bulk
{
  "ids": [12, 15, 19],
  "action": { "action": "move", "location_id": 7 }
}
```

Azioni disponibili: `move`, `categorize`, `status`, `add_tags`, `favorite`, `delete`,
`restore`.

## Categorie e posizioni

| Metodo | Percorso | Descrizione |
|---|---|---|
| GET | `/categories` · `/categories/tree` | Elenco piatto (con percorso) · albero con conteggi |
| POST · PATCH · DELETE | `/categories[/:id]` | Crea, modifica/sposta, elimina. `?cascade=1` elimina anche le sottocategorie |
| GET | `/locations` · `/locations/tree` | Come sopra, per le posizioni |
| GET | `/locations/:id/contents` | Cosa c'è qui: sotto-posizioni, oggetti, valore, allegati. `?deep=1` include le sotto-posizioni |
| POST · PATCH · DELETE | `/locations[/:id]` | Crea, modifica/sposta, elimina |

Eliminando un nodo senza `cascade`, figli e oggetti salgono di un livello: non si perde nulla.

## Tag, stati, negozi, impostazioni

| Metodo | Percorso | Descrizione |
|---|---|---|
| GET · POST · PATCH · DELETE | `/tags[/:id]` | Tag |
| GET · POST · PATCH · DELETE | `/statuses[/:id]` | Stati. In eliminazione: `?reassign_to=<id>` se lo stato è in uso |
| GET · POST · PATCH · DELETE | `/vendors[/:id]` | Negozi |
| GET · PUT | `/settings` | Preferenze (chiave/valore) |

## Allegati

| Metodo | Percorso | Descrizione |
|---|---|---|
| POST | `/attachments?entity_type=item&entity_id=12&kind=receipt` | Upload multipart (uno o più file) |
| GET | `/attachments?entity_type=item&entity_id=12` | Elenco |
| GET | `/attachments/:id` | Metadati |
| GET | `/attachments/:id/file` | Contenuto. `?download=1` forza il salvataggio |
| PATCH | `/attachments/:id` | Titolo, tipo, foto principale |
| DELETE | `/attachments/:id` | Rimuove il collegamento (il file resta se usato altrove) |
| GET | `/storage/check` | Presenza dei file. `?deep=1` ricalcola gli hash |
| POST | `/storage/gc` | Elimina i blob orfani. `{ "dry_run": true }` per simulare |

I metadati viaggiano nella query string, non nel form: sono disponibili prima di leggere il
file e non dipendono dall'ordine dei campi.

## Lista acquisti

| Metodo | Percorso | Descrizione |
|---|---|---|
| GET | `/shopping` | Elenco. Filtri: `status`, `priority`, `category_id`, `q` |
| POST · PATCH · DELETE | `/shopping[/:id]` | Crea, modifica, elimina |
| POST | `/shopping/:id/convert` | "L'ho comprato": crea l'oggetto nell'inventario |

`convert` accetta `quantity`, `purchase_price`, `purchase_date`, `location_id`,
`category_id`, `vendor_id`, `status_key`.

## Sintesi

| Metodo | Percorso | Descrizione |
|---|---|---|
| GET | `/dashboard` | Totali, spesa, recenti, da comprare, scorte, garanzie, scadenze |
| GET | `/stats?months=12` | Valore, spesa per categoria/stanza/negozio/stato, serie mensile, top 10 |
| GET | `/search?q=...` | Ricerca globale su oggetti, categorie, posizioni, tag, acquisti |

## Dati e manutenzione

| Metodo | Percorso | Descrizione |
|---|---|---|
| GET | `/backups` | Elenco dei backup |
| POST | `/backups` | Crea un backup (`{ "label": "prima del trasloco" }`) |
| GET | `/backups/:name` | Manifest |
| POST | `/backups/:name/verify` | Verifica di integrità |
| POST | `/backups/:name/restore` | Ripristino (`{ "dry_run": true }` per simulare) |
| DELETE | `/backups/:name` | Elimina il backup |
| GET | `/export/json` · `/export/csv` | Esportazione |
| POST | `/import/csv` · `/import/json` | Importazione. `?mode=merge\|create_only` |
| POST | `/seed` | Categorie e posizioni iniziali (solo su database vuoto, o `{"force":true}`) |

## Esempi

```bash
# Creare un oggetto
curl -X POST http://127.0.0.1:8787/api/v1/items \
  -H 'Content-Type: application/json' \
  -d '{"name":"Trapano Bosch","brand":"Bosch","purchase_price":89,
       "purchase_date":"2026-05-02","warranty_months":24,"tags":["utensili"]}'

# Cosa c'è nella scatola 12, comprese le sotto-posizioni
curl "http://127.0.0.1:8787/api/v1/locations/12/contents?deep=1"

# Consumabili sotto scorta
curl "http://127.0.0.1:8787/api/v1/items?below_min=1&sort=quantity&direction=asc"

# Caricare una ricevuta
curl -X POST "http://127.0.0.1:8787/api/v1/attachments?entity_type=item&entity_id=12&kind=receipt" \
  -F file=@ricevuta.pdf
```

-- =============================================================================
-- datahypotenus - schema iniziale
-- =============================================================================
-- Convenzioni:
--   * date       -> TEXT 'YYYY-MM-DD'
--   * timestamp  -> TEXT ISO-8601 UTC
--   * booleani   -> INTEGER 0/1
--   * denaro     -> REAL + colonna currency (nessuna conversione di cambio)
-- Ogni tabella ha created_at/updated_at dove ha senso una storia.
-- =============================================================================

-- --- Impostazioni applicative (chiave/valore) --------------------------------
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- --- Categorie (albero) ------------------------------------------------------
-- Categoria e sottocategoria sono lo stesso concetto a livelli diversi:
-- un solo campo category_id sugli oggetti, profondita' illimitata.
CREATE TABLE categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id   INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
  name        TEXT NOT NULL,
  description TEXT,
  icon        TEXT,
  color       TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  CHECK (id <> parent_id)
);
CREATE UNIQUE INDEX ux_categories_sibling_name ON categories (ifnull(parent_id, -1), name COLLATE NOCASE);
CREATE INDEX ix_categories_parent ON categories (parent_id);

-- --- Posizioni (albero) ------------------------------------------------------
-- Una sola gerarchia per stanze, mobili, ripiani e scatole: il "contenitore"
-- e' una posizione con kind='container'. Vedi docs/DECISIONS.md (D-03).
CREATE TABLE locations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id  INTEGER REFERENCES locations(id) ON DELETE RESTRICT,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'other'
             CHECK (kind IN ('building','floor','room','area','furniture','shelf','container','other')),
  code       TEXT UNIQUE,          -- codice interno stampabile / QR code
  notes      TEXT,
  color      TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  CHECK (id <> parent_id)
);
CREATE UNIQUE INDEX ux_locations_sibling_name ON locations (ifnull(parent_id, -1), name COLLATE NOCASE);
CREATE INDEX ix_locations_parent ON locations (parent_id);
CREATE INDEX ix_locations_kind ON locations (kind);

-- --- Stati degli oggetti (configurabili dall'utente) -------------------------
-- L'applicazione ragiona sui flag semantici, mai sulle etichette: l'utente puo'
-- rinominare "Posseduto" senza rompere dashboard e statistiche.
CREATE TABLE item_statuses (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  key             TEXT NOT NULL UNIQUE,             -- chiave stabile (owned, to_buy, ...)
  label           TEXT NOT NULL,
  color           TEXT,
  counts_as_owned INTEGER NOT NULL DEFAULT 1,       -- entra nei conteggi e nel valore
  is_wishlist     INTEGER NOT NULL DEFAULT 0,       -- compare fra le cose da comprare
  is_default      INTEGER NOT NULL DEFAULT 0,       -- preselezionato nei form
  is_system       INTEGER NOT NULL DEFAULT 0,       -- non eliminabile
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- --- Negozi / venditori ------------------------------------------------------
CREATE TABLE vendors (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  website    TEXT,
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE UNIQUE INDEX ux_vendors_name ON vendors (name COLLATE NOCASE);

-- --- Tag ---------------------------------------------------------------------
CREATE TABLE tags (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  color      TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE UNIQUE INDEX ux_tags_name ON tags (name COLLATE NOCASE);

-- --- Oggetti -----------------------------------------------------------------
CREATE TABLE items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uid         TEXT NOT NULL UNIQUE,          -- id pubblico stabile (QR, import/export)
  name        TEXT NOT NULL,
  description TEXT,

  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  status_id   INTEGER NOT NULL REFERENCES item_statuses(id) ON DELETE RESTRICT,
  vendor_id   INTEGER REFERENCES vendors(id) ON DELETE SET NULL,

  -- inventario
  quantity         REAL NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit             TEXT NOT NULL DEFAULT 'pz',
  is_consumable    INTEGER NOT NULL DEFAULT 0,
  min_quantity     REAL CHECK (min_quantity IS NULL OR min_quantity >= 0),
  initial_quantity REAL CHECK (initial_quantity IS NULL OR initial_quantity >= 0),

  -- identificazione tecnica
  brand         TEXT,
  model         TEXT,
  serial_number TEXT,
  sku           TEXT,
  barcode       TEXT,

  -- dati economici (purchase_price e' UNITARIO, il totale e' derivato)
  purchase_price REAL CHECK (purchase_price IS NULL OR purchase_price >= 0),
  current_value  REAL CHECK (current_value IS NULL OR current_value >= 0),
  currency       TEXT NOT NULL DEFAULT 'EUR',
  purchase_date  TEXT,
  product_url    TEXT,

  -- garanzia
  warranty_months INTEGER CHECK (warranty_months IS NULL OR warranty_months >= 0),
  warranty_start  TEXT,
  warranty_end    TEXT,
  warranty_notes  TEXT,

  -- scadenze e durata
  expiration_date          TEXT,
  expected_lifespan_months INTEGER CHECK (expected_lifespan_months IS NULL OR expected_lifespan_months >= 0),

  notes       TEXT,
  specs       TEXT,                          -- oggetto JSON di specifiche libere
  is_favorite INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  deleted_at TEXT                            -- soft delete: cestino ripristinabile
);
CREATE INDEX ix_items_category ON items (category_id);
CREATE INDEX ix_items_location ON items (location_id);
CREATE INDEX ix_items_status ON items (status_id);
CREATE INDEX ix_items_vendor ON items (vendor_id);
CREATE INDEX ix_items_deleted ON items (deleted_at);
CREATE INDEX ix_items_name ON items (name COLLATE NOCASE);
CREATE INDEX ix_items_purchase_date ON items (purchase_date);
CREATE INDEX ix_items_warranty_end ON items (warranty_end) WHERE warranty_end IS NOT NULL;
CREATE INDEX ix_items_expiration ON items (expiration_date) WHERE expiration_date IS NOT NULL;
CREATE INDEX ix_items_barcode ON items (barcode) WHERE barcode IS NOT NULL;
CREATE INDEX ix_items_serial ON items (serial_number) WHERE serial_number IS NOT NULL;

-- --- Oggetti <-> tag ---------------------------------------------------------
CREATE TABLE item_tags (
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
);
CREATE INDEX ix_item_tags_tag ON item_tags (tag_id);

-- --- File fisici (content-addressable storage) -------------------------------
-- Il blob e' identificato dallo SHA-256 del contenuto: caricare due volte la
-- stessa ricevuta occupa un solo file. Un blob viene rimosso dal disco solo
-- quando nessun allegato lo referenzia piu' (garbage collection esplicita).
CREATE TABLE files (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  sha256     TEXT NOT NULL UNIQUE,
  byte_size  INTEGER NOT NULL,
  mime       TEXT NOT NULL,
  ext        TEXT NOT NULL DEFAULT '',
  rel_path   TEXT NOT NULL,   -- relativo a DATA_DIR/attachments
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- --- Allegati (collegamento logico file <-> entita') -------------------------
-- entity_type/entity_id e' un riferimento polimorfico voluto: lo stesso
-- meccanismo serve oggi per gli oggetti e domani per manutenzioni e posizioni,
-- senza duplicare tabelle. L'integrita' e' garantita dal service. (D-05)
CREATE TABLE attachments (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id           INTEGER NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  entity_type       TEXT NOT NULL CHECK (entity_type IN ('item','shopping_item','maintenance','location')),
  entity_id         INTEGER NOT NULL,
  kind              TEXT NOT NULL DEFAULT 'other'
                    CHECK (kind IN ('photo','receipt','invoice','manual','warranty','other')),
  title             TEXT,
  original_filename TEXT NOT NULL,
  is_primary        INTEGER NOT NULL DEFAULT 0,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX ix_attachments_entity ON attachments (entity_type, entity_id);
CREATE INDEX ix_attachments_file ON attachments (file_id);

-- --- Cronologia degli oggetti ------------------------------------------------
-- Registrata fin dalla prima versione: e' l'unico dato che non si puo'
-- ricostruire a posteriori. Costa una INSERT per modifica.
CREATE TABLE item_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id     INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,        -- created|updated|quantity|moved|status|deleted|restored|...
  field       TEXT,
  old_value   TEXT,
  new_value   TEXT,
  note        TEXT,
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX ix_item_events_item ON item_events (item_id, occurred_at DESC);
CREATE INDEX ix_item_events_time ON item_events (occurred_at DESC);

-- --- Lista acquisti ----------------------------------------------------------
-- Entita' separata dagli oggetti: un desiderio ha attributi propri (priorita',
-- prezzo stimato) e non deve inquinare i conteggi dell'inventario. Alla
-- conversione nasce un item e il legame resta tracciato. (D-06)
CREATE TABLE shopping_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  notes            TEXT,
  category_id      INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  location_id      INTEGER REFERENCES locations(id) ON DELETE SET NULL,  -- destinazione prevista
  vendor_id        INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
  desired_quantity REAL NOT NULL DEFAULT 1 CHECK (desired_quantity > 0),
  unit             TEXT NOT NULL DEFAULT 'pz',
  estimated_price  REAL CHECK (estimated_price IS NULL OR estimated_price >= 0),
  currency         TEXT NOT NULL DEFAULT 'EUR',
  priority         TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('bassa','media','alta','urgente')),
  status           TEXT NOT NULL DEFAULT 'da_comprare'
                   CHECK (status IN ('da_comprare','ordinato','acquistato','annullato')),
  url              TEXT,
  item_id          INTEGER REFERENCES items(id) ON DELETE SET NULL,  -- creato alla conversione
  source_item_id   INTEGER REFERENCES items(id) ON DELETE SET NULL,  -- consumabile che l'ha generato
  purchased_at     TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX ix_shopping_status ON shopping_items (status);
CREATE INDEX ix_shopping_category ON shopping_items (category_id);
CREATE INDEX ix_shopping_source ON shopping_items (source_item_id);

-- --- Manutenzioni ------------------------------------------------------------
-- Tabella creata subito (requisito 18: la struttura non deve impedire questa
-- funzionalita'), senza interfaccia nell'MVP. Vedi ROADMAP.md.
CREATE TABLE maintenance_records (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id       INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  kind          TEXT,
  description   TEXT,
  performed_at  TEXT,
  next_due_date TEXT,
  cost          REAL CHECK (cost IS NULL OR cost >= 0),
  currency      TEXT NOT NULL DEFAULT 'EUR',
  provider      TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX ix_maintenance_item ON maintenance_records (item_id);
CREATE INDEX ix_maintenance_next ON maintenance_records (next_due_date) WHERE next_due_date IS NOT NULL;

-- --- Ricerca full-text -------------------------------------------------------
-- Indice esterno su items: nessuna duplicazione del contenuto, sincronizzato
-- da trigger. unicode61 + remove_diacritics: "caffe" trova "caffe'".
CREATE VIRTUAL TABLE items_fts USING fts5 (
  name, description, brand, model, serial_number, sku, barcode, notes,
  content = 'items',
  content_rowid = 'id',
  tokenize = "unicode61 remove_diacritics 2"
);

CREATE TRIGGER items_fts_ai AFTER INSERT ON items BEGIN
  INSERT INTO items_fts (rowid, name, description, brand, model, serial_number, sku, barcode, notes)
  VALUES (new.id, new.name, new.description, new.brand, new.model, new.serial_number, new.sku, new.barcode, new.notes);
END;

CREATE TRIGGER items_fts_ad AFTER DELETE ON items BEGIN
  INSERT INTO items_fts (items_fts, rowid, name, description, brand, model, serial_number, sku, barcode, notes)
  VALUES ('delete', old.id, old.name, old.description, old.brand, old.model, old.serial_number, old.sku, old.barcode, old.notes);
END;

CREATE TRIGGER items_fts_au AFTER UPDATE ON items BEGIN
  INSERT INTO items_fts (items_fts, rowid, name, description, brand, model, serial_number, sku, barcode, notes)
  VALUES ('delete', old.id, old.name, old.description, old.brand, old.model, old.serial_number, old.sku, old.barcode, old.notes);
  INSERT INTO items_fts (rowid, name, description, brand, model, serial_number, sku, barcode, notes)
  VALUES (new.id, new.name, new.description, new.brand, new.model, new.serial_number, new.sku, new.barcode, new.notes);
END;

-- --- Viste di percorso -------------------------------------------------------
-- Il percorso completo ("Casa / Cucina / Cassetto 2") e' calcolato, non
-- memorizzato: rinominare un nodo aggiorna tutto senza migrazioni di dati.
CREATE VIEW category_paths AS
WITH RECURSIVE tree(id, parent_id, name, path, depth, root_id) AS (
  SELECT id, parent_id, name, name, 0, id FROM categories WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, c.parent_id, c.name, tree.path || ' / ' || c.name, tree.depth + 1, tree.root_id
  FROM categories c JOIN tree ON c.parent_id = tree.id
)
SELECT id, parent_id, name, path, depth, root_id FROM tree;

CREATE VIEW location_paths AS
WITH RECURSIVE tree(id, parent_id, name, kind, path, depth, root_id, room_id, room_name) AS (
  SELECT id, parent_id, name, kind, name, 0, id,
         CASE WHEN kind = 'room' THEN id ELSE NULL END,
         CASE WHEN kind = 'room' THEN name ELSE NULL END
  FROM locations WHERE parent_id IS NULL
  UNION ALL
  SELECT l.id, l.parent_id, l.name, l.kind, tree.path || ' / ' || l.name, tree.depth + 1, tree.root_id,
         CASE WHEN l.kind = 'room' THEN l.id ELSE tree.room_id END,
         CASE WHEN l.kind = 'room' THEN l.name ELSE tree.room_name END
  FROM locations l JOIN tree ON l.parent_id = tree.id
)
SELECT id, parent_id, name, kind, path, depth, root_id, room_id, room_name FROM tree;

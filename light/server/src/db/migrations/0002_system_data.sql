-- =============================================================================
-- Dati di sistema minimi.
-- Non sono "dati di esempio": senza almeno uno stato non e' possibile creare un
-- oggetto (items.status_id e' NOT NULL). Le etichette sono modificabili
-- dall'utente; le chiavi (key) restano stabili perche' il codice ci si appoggia.
-- Le categorie/posizioni di esempio NON stanno qui: sono un seed opzionale.
-- =============================================================================

INSERT INTO item_statuses (key, label, color, counts_as_owned, is_wishlist, is_default, is_system, sort_order) VALUES
  ('owned',       'Posseduto',    '#22c55e', 1, 0, 1, 1, 10),
  ('to_buy',      'Da acquistare','#f59e0b', 0, 1, 0, 1, 20),
  ('ordered',     'Ordinato',     '#3b82f6', 0, 1, 0, 1, 30),
  ('in_delivery', 'In consegna',  '#06b6d4', 0, 1, 0, 0, 40),
  ('lent',        'Prestato',     '#a855f7', 1, 0, 0, 0, 50),
  ('borrowed',    'In prestito da altri', '#8b5cf6', 0, 0, 0, 0, 55),
  ('lost',        'Smarrito',     '#94a3b8', 0, 0, 0, 0, 60),
  ('damaged',     'Danneggiato',  '#ef4444', 1, 0, 0, 0, 70),
  ('to_repair',   'Da riparare',  '#f97316', 1, 0, 0, 0, 80),
  ('consumed',    'Consumato',    '#78716c', 0, 0, 0, 0, 90),
  ('sold',        'Venduto',      '#64748b', 0, 0, 0, 0, 100),
  ('disposed',    'Eliminato',    '#57534e', 0, 0, 0, 0, 110);

INSERT INTO settings (key, value) VALUES
  ('app.name',                   'datahypotenus'),
  ('app.default_currency',       'EUR'),
  ('app.default_unit',           'pz'),
  ('alerts.warranty_days',       '60'),   -- garanzia "in scadenza" entro N giorni
  ('alerts.expiration_days',     '30'),   -- scadenza generica entro N giorni
  ('alerts.dashboard_limit',     '8'),    -- righe per riquadro in dashboard
  ('backup.keep',                '10'),
  ('inventory.page_size',        '50');

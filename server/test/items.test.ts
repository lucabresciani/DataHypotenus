import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap } from '../src/bootstrap.ts';
import { getDb } from '../src/db/connection.ts';
import {
  adjustQuantity,
  bulkAction,
  createItem,
  duplicateItem,
  getItem,
  itemHistory,
  listItems,
  purgeItem,
  restoreItem,
  softDeleteItem,
  updateItem,
} from '../src/modules/items.service.ts';
import { createCategory } from '../src/modules/categories.service.ts';
import { createLocation } from '../src/modules/locations.service.ts';
import { getStatusByKey } from '../src/modules/statuses.service.ts';

let cucinaId = 0;
let cassettoId = 0;

before(() => {
  bootstrap({ seed: false });
  const casa = createLocation({ name: 'Casa', kind: 'building' });
  const cucina = createLocation({ name: 'Cucina', kind: 'room', parent_id: casa.id });
  const mobile = createLocation({ name: 'Mobile alto', kind: 'furniture', parent_id: cucina.id });
  const cassetto = createLocation({ name: 'Cassetto 2', kind: 'container', parent_id: mobile.id });
  cucinaId = cucina.id;
  cassettoId = cassetto.id;

  const cucinaCat = createCategory({ name: 'Cucina' });
  createCategory({ name: 'Pentole', parent_id: cucinaCat.id });

  // Dati usati dai test su ricerca e filtri.
  createItem({ name: 'Aspirapolvere Dyson V15', brand: 'Dyson', purchase_price: 599, purchase_date: '2026-02-10' });
  createItem({ name: 'Set pentole in acciaio', brand: 'Lagostina', purchase_price: 150, quantity: 5 });
  createItem({ name: 'Posate', location_id: cassettoId });
});

describe('creazione oggetti', () => {
  it('crea un oggetto con i valori minimi e assegna uid e stato predefinito', () => {
    const item = createItem({ name: 'Padella antiaderente' });
    assert.ok(item.id > 0);
    assert.match(item.uid, /^[0-9A-Z]{22}$/);
    assert.equal(item.quantity, 1);
    assert.equal(item.unit, 'pz');
    assert.equal(item.status.key, 'owned');
    assert.deepEqual(item.tags, []);
  });

  it('rifiuta un oggetto senza nome', () => {
    assert.throws(() => createItem({ name: '   ' }), /nome/i);
  });

  it('rifiuta una data non valida', () => {
    assert.throws(() => createItem({ name: 'Test data', purchase_date: '15/03/2026' }), /AAAA-MM-GG/);
  });

  it('calcola la fine garanzia da data di acquisto e durata', () => {
    const item = createItem({ name: 'Frigorifero', purchase_date: '2026-01-31', warranty_months: 24 });
    assert.equal(item.warranty.end, '2028-01-31');
    assert.equal(item.warranty.status, 'active');
  });

  it('gestisce i mesi corti nel calcolo della garanzia', () => {
    const item = createItem({ name: 'Forno', purchase_date: '2026-01-31', warranty_months: 1 });
    assert.equal(item.warranty.end, '2026-02-28');
  });

  it('crea i tag al volo e li collega', () => {
    const item = createItem({ name: 'Trapano', tags: ['utensili', 'fai-da-te'] });
    assert.deepEqual(
      item.tags.map((t) => t.name).sort(),
      ['fai-da-te', 'utensili'],
    );
  });

  it('espone il percorso completo della posizione e la stanza di appartenenza', () => {
    const item = createItem({ name: 'Mestoli', location_id: cassettoId });
    assert.equal(item.location?.path, 'Casa / Cucina / Mobile alto / Cassetto 2');
    assert.equal(item.location?.room_name, 'Cucina');
  });
});

describe('modifica e quantita', () => {
  it('aggiorna i campi e registra la cronologia', () => {
    const item = createItem({ name: 'Bicchieri', quantity: 6 });
    const updated = updateItem(item.id, { quantity: 4, name: 'Bicchieri da acqua' });
    assert.equal(updated.quantity, 4);
    assert.equal(updated.name, 'Bicchieri da acqua');

    const history = itemHistory(item.id);
    const quantityEvent = history.find((e) => e.event_type === 'quantity');
    assert.equal(quantityEvent?.old_value, '6');
    assert.equal(quantityEvent?.new_value, '4');
    assert.ok(history.some((e) => e.event_type === 'created'));
  });

  it('incrementa e decrementa la quantita senza scendere sotto zero', () => {
    const item = createItem({ name: 'Detersivo', quantity: 1, is_consumable: true, min_quantity: 1 });
    assert.equal(adjustQuantity(item.id, -1).quantity, 0);
    assert.equal(adjustQuantity(item.id, -5).quantity, 0);
    assert.equal(adjustQuantity(item.id, 3).quantity, 3);
  });

  it('segnala i consumabili sotto la soglia minima', () => {
    const item = createItem({ name: 'Carta forno', quantity: 1, is_consumable: true, min_quantity: 2 });
    assert.equal(getItem(item.id).below_min, true);
    assert.ok(listItems({ below_min: true }).items.some((i) => i.id === item.id));
  });

  it('registra lo spostamento come evento "moved"', () => {
    const item = createItem({ name: 'Tagliere', location_id: cucinaId });
    updateItem(item.id, { location_id: cassettoId });
    assert.ok(itemHistory(item.id).some((e) => e.event_type === 'moved'));
  });
});

describe('ricerca e filtri', () => {
  it('trova per prefisso di parola (full-text)', () => {
    assert.ok(listItems({ q: 'aspira' }).items.some((i) => i.name === 'Aspirapolvere Dyson V15'));
  });

  it('trova per marca', () => {
    assert.ok(listItems({ q: 'Dyson' }).total > 0);
  });

  it('trova per nome della posizione collegata', () => {
    assert.ok(listItems({ q: 'Cassetto 2' }).total > 0);
  });

  it('filtra per fascia di prezzo', () => {
    const result = listItems({ price_min: 500, price_max: 700 });
    assert.ok(result.total > 0);
    assert.ok(result.items.every((i) => (i.purchase_price ?? 0) >= 500 && (i.purchase_price ?? 0) <= 700));
  });

  it('filtra per posizione includendo o escludendo le sotto-posizioni', () => {
    const deep = listItems({ location_id: cucinaId, include_sublocations: true });
    const shallow = listItems({ location_id: cucinaId, include_sublocations: false });
    assert.ok(deep.total > shallow.total);
  });

  it('ordina per prezzo decrescente mettendo in fondo i valori mancanti', () => {
    const result = listItems({ sort: 'purchase_price', direction: 'desc', limit: 100 });
    const prices = result.items.map((i) => i.purchase_price).filter((p): p is number => p !== null);
    assert.deepEqual(prices, [...prices].sort((a, b) => b - a));
    const firstNull = result.items.findIndex((i) => i.purchase_price === null);
    if (firstNull !== -1) {
      assert.ok(result.items.slice(firstNull).every((i) => i.purchase_price === null));
    }
  });

  it('calcola il valore totale come prezzo unitario per quantita', () => {
    const result = listItems({ q: 'Set pentole in acciaio' });
    assert.equal(result.items[0]?.total_value, 750);
  });

  it('non fallisce con i caratteri speciali della sintassi full-text', () => {
    assert.doesNotThrow(() => listItems({ q: 'NEAR( "* -' }));
    assert.doesNotThrow(() => listItems({ q: '50%' }));
    assert.doesNotThrow(() => listItems({ q: "l'oggetto" }));
  });
});

describe('cestino e cancellazione', () => {
  it('sposta nel cestino, esclude dalle liste e ripristina', () => {
    const item = createItem({ name: 'Vecchialampada' });
    softDeleteItem(item.id);
    assert.equal(listItems({ q: 'Vecchialampada' }).total, 0);
    assert.equal(listItems({ q: 'Vecchialampada', trash: 'only' }).total, 1);

    restoreItem(item.id);
    assert.equal(listItems({ q: 'Vecchialampada' }).total, 1);
  });

  it('cancella definitivamente solo su richiesta esplicita', () => {
    const item = createItem({ name: 'Da eliminare' });
    purgeItem(item.id);
    assert.throws(() => getItem(item.id), /non trovato/i);
  });

  it('rimuove le righe dell indice full-text quando l oggetto sparisce', () => {
    const item = createItem({ name: 'Oggettofantasma' });
    purgeItem(item.id);
    assert.equal(listItems({ q: 'Oggettofantasma' }).total, 0);
  });
});

describe('azioni rapide e multiple', () => {
  it('duplica un oggetto mantenendo i tag', () => {
    const item = createItem({ name: 'Sedia', tags: ['arredo'], purchase_price: 49 });
    const copy = duplicateItem(item.id);
    assert.equal(copy.name, 'Sedia (copia)');
    assert.deepEqual(copy.tags.map((t) => t.name), ['arredo']);
    assert.notEqual(copy.id, item.id);
  });

  it('sposta piu oggetti in una sola operazione', () => {
    const a = createItem({ name: 'Piatti fondi' });
    const b = createItem({ name: 'Piatti piani' });
    const result = bulkAction([a.id, b.id], { action: 'move', location_id: cassettoId });
    assert.equal(result.affected, 2);
    assert.equal(getItem(a.id).location?.id, cassettoId);
    assert.equal(getItem(b.id).location?.id, cassettoId);
  });

  it('cambia stato a piu oggetti', () => {
    const damaged = getStatusByKey('damaged', getDb());
    assert.ok(damaged);
    const a = createItem({ name: 'Tazza A' });
    const b = createItem({ name: 'Tazza B' });
    bulkAction([a.id, b.id], { action: 'status', status_id: damaged.id });
    assert.equal(getItem(a.id).status.key, 'damaged');
    assert.equal(getItem(b.id).status.key, 'damaged');
  });

  it('aggiunge tag in blocco senza rimuovere quelli esistenti', () => {
    const item = createItem({ name: 'Coperta', tags: ['inverno'] });
    bulkAction([item.id], { action: 'add_tags', tags: ['tessili'] });
    assert.deepEqual(getItem(item.id).tags.map((t) => t.name).sort(), ['inverno', 'tessili']);
  });
});

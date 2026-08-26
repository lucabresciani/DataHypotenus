/**
 * Statistiche e dashboard.
 *
 * Questi test nascono da un bug vero: gli alias `key`/`label` coincidevano con
 * colonne di `item_statuses`, e SQLite raggruppava sulla colonna della tabella
 * invece che sull'alias, restituendo un'unica riga con il totale generale.
 * Da qui in poi ogni aggregato verifica quante righe torna, non solo la somma.
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap } from '../src/bootstrap.ts';
import { getDb } from '../src/db/connection.ts';
import { byCategory, byMonth, byRoom, byStatus, byVendor, buildStats } from '../src/modules/stats.service.ts';
import { buildDashboard } from '../src/modules/dashboard.service.ts';
import { createItem } from '../src/modules/items.service.ts';
import { createCategory } from '../src/modules/categories.service.ts';
import { createLocation } from '../src/modules/locations.service.ts';
import { createVendor } from '../src/modules/vendors.service.ts';
import { getStatusByKey } from '../src/modules/statuses.service.ts';
import { todayIso } from '../src/core/dates.ts';

before(() => {
  bootstrap({ seed: false });
  const db = getDb();

  const elettronica = createCategory({ name: 'Elettronica' });
  const informatica = createCategory({ name: 'Informatica', parent_id: elettronica.id });
  const cucina = createCategory({ name: 'Cucina' });

  const casa = createLocation({ name: 'Casa', kind: 'building' });
  const soggiorno = createLocation({ name: 'Soggiorno', kind: 'room', parent_id: casa.id });
  const mobileTv = createLocation({ name: 'Mobile TV', kind: 'furniture', parent_id: soggiorno.id });
  const cucinaLoc = createLocation({ name: 'Cucina', kind: 'room', parent_id: casa.id });
  // Due posizioni che NON sono stanze: non devono fondersi nell'edificio.
  const balcone = createLocation({ name: 'Balcone', kind: 'area', parent_id: casa.id });
  const cantina = createLocation({ name: 'Cantina', kind: 'area', parent_id: casa.id });

  const amazon = createVendor({ name: 'Amazon' });
  const ikea = createVendor({ name: 'IKEA' });

  createItem({ name: 'Portatile', category_id: informatica.id, location_id: soggiorno.id, vendor_id: amazon.id, purchase_price: 1000, purchase_date: todayIso() });
  createItem({ name: 'Televisore', category_id: elettronica.id, location_id: mobileTv.id, vendor_id: amazon.id, purchase_price: 500, purchase_date: todayIso() });
  createItem({ name: 'Pentole', category_id: cucina.id, location_id: cucinaLoc.id, vendor_id: ikea.id, purchase_price: 30, quantity: 3, purchase_date: todayIso() });
  createItem({ name: 'Sedia da balcone', location_id: balcone.id, purchase_price: 40, purchase_date: todayIso() });
  createItem({ name: 'Cassa attrezzi', location_id: cantina.id, purchase_price: 60, purchase_date: todayIso() });
  createItem({ name: 'Senza niente' });

  // Un oggetto ancora da comprare non deve entrare nel patrimonio.
  const toBuy = getStatusByKey('to_buy', db);
  createItem({ name: 'Divano desiderato', status_id: toBuy?.id ?? null, purchase_price: 900, category_id: cucina.id });
});

describe('aggregati per categoria', () => {
  it('produce una riga per categoria radice, non una sola riga totale', () => {
    const buckets = byCategory();
    const labels = buckets.map((b) => b.label).sort();
    assert.deepEqual(labels, ['Cucina', 'Elettronica', 'Senza categoria']);
  });

  it('fa confluire le sottocategorie nella radice', () => {
    const elettronica = byCategory().find((b) => b.label === 'Elettronica');
    assert.equal(elettronica?.items, 2); // portatile (sottocategoria) + televisore
    assert.equal(elettronica?.value, 1500);
  });

  it('calcola il valore come prezzo per quantita', () => {
    assert.equal(byCategory().find((b) => b.label === 'Cucina')?.value, 90); // 30 x 3
  });

  it('esclude dal patrimonio gli stati che non contano come possesso', () => {
    const cucina = byCategory().find((b) => b.label === 'Cucina');
    assert.equal(cucina?.items, 1, 'il divano "da acquistare" non deve essere contato');
  });
});

describe('aggregati per stanza', () => {
  it('produce una riga per stanza', () => {
    const labels = byRoom().map((b) => b.label).sort();
    assert.deepEqual(labels, ['Balcone', 'Cantina', 'Cucina', 'Senza posizione', 'Soggiorno']);
  });

  it('fa confluire mobili e contenitori nella stanza che li ospita', () => {
    const soggiorno = byRoom().find((b) => b.label === 'Soggiorno');
    assert.equal(soggiorno?.items, 2); // portatile in stanza + televisore nel mobile
    assert.equal(soggiorno?.value, 1500);
  });

  it('tiene separate le posizioni che non sono stanze, con il loro nome', () => {
    const buckets = byRoom();
    // Bug vero: raggruppando sull'edificio, balcone e cantina finivano in
    // un'unica riga etichettata "Casa / Balcone".
    assert.equal(buckets.find((b) => b.label === 'Balcone')?.value, 40);
    assert.equal(buckets.find((b) => b.label === 'Cantina')?.value, 60);
    assert.ok(!buckets.some((b) => b.label.includes(' / ')), 'le etichette sono nomi, non percorsi');
  });
});

describe('aggregati per negozio e per stato', () => {
  it('produce una riga per negozio', () => {
    const buckets = byVendor();
    assert.equal(buckets.find((b) => b.label === 'Amazon')?.items, 2);
    assert.equal(buckets.find((b) => b.label === 'IKEA')?.value, 90);
    assert.ok(buckets.some((b) => b.label === 'Senza negozio'));
  });

  it('produce una riga per stato con almeno un oggetto', () => {
    const buckets = byStatus();
    assert.equal(buckets.find((b) => b.key === 'owned')?.items, 6);
    assert.equal(buckets.find((b) => b.key === 'to_buy')?.items, 1);
  });
});

describe('serie mensile', () => {
  it('restituisce sempre tutti i mesi richiesti, anche quelli senza acquisti', () => {
    const series = byMonth(12);
    assert.equal(series.length, 12);
    assert.ok(series.every((m) => /^\d{4}-\d{2}$/.test(m.month)));
    assert.equal(series.at(-1)?.month, todayIso().slice(0, 7));
    assert.ok((series.at(-1)?.value ?? 0) > 0);
  });
});

describe('riepilogo completo', () => {
  it('somma solo cio che si possiede', () => {
    const stats = buildStats(12);
    assert.equal(stats.totals.items, 6);
    assert.equal(stats.totals.value, 1690); // 1000 + 500 + 90 + 40 + 60, senza il divano desiderato
    assert.equal(stats.totals.without_price, 1);
  });

  it('elenca gli oggetti di maggior valore in ordine', () => {
    const top = buildStats(12).top_items;
    assert.equal(top[0]?.name, 'Portatile');
    assert.ok((top[0]?.value ?? 0) >= (top[1]?.value ?? 0));
  });

  it('la dashboard conta gli oggetti e il valore in modo coerente con le statistiche', () => {
    const dashboard = buildDashboard();
    const stats = buildStats(12);
    assert.equal(dashboard.totals.inventory_value, stats.totals.value);
    assert.equal(dashboard.totals.items, 7, 'la dashboard conta tutti gli oggetti non cestinati');
    assert.ok(dashboard.recent_added.length > 0);
  });
});

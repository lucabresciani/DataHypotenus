/** Import / export: la garanzia anti lock-in va protetta da test. */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap } from '../src/bootstrap.ts';
import { parseCsv, toCsv } from '../src/core/csv.ts';
import { exportItemsCsv, exportJson, importItemsCsv, importJson } from '../src/modules/transfer.service.ts';
import { createItem, getItem, listItems } from '../src/modules/items.service.ts';
import { listCategories } from '../src/modules/categories.service.ts';
import { listLocations } from '../src/modules/locations.service.ts';

before(() => {
  bootstrap({ seed: false });
});

describe('formato CSV', () => {
  it('protegge virgole, virgolette e a capo', () => {
    const csv = toCsv([{ a: 'testo, con virgola', b: 'virgolette "doppie"', c: 'riga\nnuova' }]);
    const parsed = parseCsv(csv);
    assert.equal(parsed[0]?.a, 'testo, con virgola');
    assert.equal(parsed[0]?.b, 'virgolette "doppie"');
    assert.equal(parsed[0]?.c, 'riga\nnuova');
  });

  it('ignora le righe completamente vuote', () => {
    assert.equal(parseCsv('a,b\n1,2\n\n3,4\n').length, 2);
  });
});

describe('export CSV', () => {
  it('esporta gli oggetti con percorsi leggibili di categoria e posizione', () => {
    createItem({
      name: 'Macchina del caffe',
      brand: 'DeLonghi',
      purchase_price: 249.99,
      purchase_date: '2026-04-01',
      tags: ['cucina', 'elettrodomestici'],
    });

    const csv = exportItemsCsv();
    const rows = parseCsv(csv);
    const row = rows.find((r) => r.name === 'Macchina del caffe');

    assert.ok(row, 'la riga deve esistere');
    assert.equal(row.brand, 'DeLonghi');
    assert.equal(row.purchase_price, '249.99');
    assert.ok(row.uid && row.uid.length === 22);
    assert.ok((row.tags ?? '').includes('cucina'));
  });
});

describe('import CSV', () => {
  it('crea oggetti, categorie e posizioni mancanti a partire dai percorsi', () => {
    const csv = [
      'name,category_path,location_path,quantity,purchase_price,tags',
      'Set asciugamani,Bagno / Tessili,Casa / Bagno / Armadietto,4,29.90,bagno; tessili',
      'Tostapane,Cucina / Elettrodomestici,Casa / Cucina,1,39.00,cucina',
    ].join('\n');

    const report = importItemsCsv(csv);
    assert.equal(report.created, 2);
    assert.equal(report.errors.length, 0);
    assert.ok(report.created_categories >= 4);
    assert.ok(report.created_locations >= 4);

    const item = listItems({ q: 'Set asciugamani' }).items[0];
    assert.equal(item?.category?.path, 'Bagno / Tessili');
    assert.equal(item?.location?.path, 'Casa / Bagno / Armadietto');
    assert.equal(item?.quantity, 4);
    assert.deepEqual(item?.tags.map((t) => t.name).sort(), ['bagno', 'tessili']);
  });

  it('reimportare lo stesso export non duplica nulla (merge per uid)', () => {
    createItem({ name: 'Aspirapolvere robot', purchase_price: 320 });
    const csv = exportItemsCsv();

    const totalBefore = listItems({ limit: 500 }).total;
    const categoriesBefore = listCategories().length;
    const locationsBefore = listLocations().length;

    const report = importItemsCsv(csv);

    assert.equal(report.created, 0);
    assert.equal(report.updated, totalBefore);
    assert.equal(listItems({ limit: 500 }).total, totalBefore);
    assert.equal(listCategories().length, categoriesBefore);
    assert.equal(listLocations().length, locationsBefore);
  });

  it('in modalita create_only lascia intatti gli oggetti esistenti', () => {
    const item = createItem({ name: 'Ventilatore', purchase_price: 50 });
    const csv = ['uid,name,purchase_price', `${item.uid},Ventilatore modificato,999`].join('\n');

    const report = importItemsCsv(csv, 'create_only');
    assert.equal(report.skipped, 1);
    assert.equal(getItem(item.id).name, 'Ventilatore');
  });

  it('salta le righe senza nome e riporta gli errori riga per riga', () => {
    const csv = ['name,purchase_date', ',2026-01-01', 'Oggetto con data sbagliata,01-01-2026'].join('\n');
    const report = importItemsCsv(csv);
    assert.equal(report.skipped, 1);
    assert.equal(report.errors.length, 1);
    assert.equal(report.errors[0]?.row, 3);
    assert.match(report.errors[0]?.message ?? '', /AAAA-MM-GG/);
  });

  it('accetta i numeri con la virgola decimale', () => {
    const report = importItemsCsv(['name,purchase_price', 'Lampada da terra,"39,90"'].join('\n'));
    assert.equal(report.created, 1);
    assert.equal(listItems({ q: 'Lampada da terra' }).items[0]?.purchase_price, 39.9);
  });
});

describe('export/import JSON', () => {
  it('esporta tutte le tabelle con i metadati di formato', () => {
    const bundle = exportJson();
    assert.equal(bundle.meta.app, 'datahypotenus');
    assert.ok(bundle.meta.schema_version >= 2);
    assert.ok(Array.isArray(bundle.items));
    assert.ok(Array.isArray(bundle.categories));
    assert.ok(Array.isArray(bundle.locations));
    assert.ok((bundle.meta.counts.items ?? 0) > 0);
  });

  it('reimportare il bundle e idempotente', () => {
    const bundle = exportJson();
    const totalBefore = listItems({ limit: 500 }).total;

    const report = importJson(bundle);
    assert.equal(report.created, 0);
    assert.equal(listItems({ limit: 500 }).total, totalBefore);
  });

  it('rifiuta un bundle senza sezione items', () => {
    assert.throws(() => importJson({ meta: {} }), /items/i);
  });
});

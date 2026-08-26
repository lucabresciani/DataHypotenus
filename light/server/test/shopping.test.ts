/** Lista acquisti: creazione, priorita', conversione in oggetto, riacquisto. */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap } from '../src/bootstrap.ts';
import {
  convertToItem,
  createShoppingItem,
  listShopping,
  restockFromItem,
  updateShoppingItem,
} from '../src/modules/shopping.service.ts';
import { adjustQuantity, createItem, getItem, itemHistory } from '../src/modules/items.service.ts';
import { createLocation } from '../src/modules/locations.service.ts';

before(() => {
  bootstrap({ seed: false });
});

describe('lista acquisti', () => {
  it('crea una voce con priorita e prezzo stimato', () => {
    const entry = createShoppingItem({ name: 'Set di pentole', estimated_price: 150, priority: 'alta' });
    assert.equal(entry.status, 'da_comprare');
    assert.equal(entry.priority, 'alta');
    assert.equal(entry.estimated_total, 150);
  });

  it('calcola il totale stimato come prezzo per quantita desiderata', () => {
    const entry = createShoppingItem({ name: 'Sedie', desired_quantity: 4, estimated_price: 45 });
    assert.equal(entry.estimated_total, 180);
  });

  it('ordina per priorita, dalle urgenze in giu', () => {
    createShoppingItem({ name: 'Materasso', priority: 'urgente' });
    createShoppingItem({ name: 'Quadro', priority: 'bassa' });
    const list = listShopping({ status: 'da_comprare' });
    assert.equal(list.items[0]?.priority, 'urgente');
    assert.ok(list.estimated_total > 0);
  });

  it('rifiuta una priorita non prevista', () => {
    assert.throws(() => createShoppingItem({ name: 'Sbagliato', priority: 'altissima' as never }), /priority/i);
  });

  it('registra la data di acquisto quando la voce passa ad "acquistato"', () => {
    const entry = createShoppingItem({ name: 'Tappeto' });
    const updated = updateShoppingItem(entry.id, { status: 'acquistato' });
    assert.equal(updated.status, 'acquistato');
    assert.ok(updated.purchased_at);
  });
});

describe('conversione in oggetto', () => {
  it('crea l oggetto usando il prezzo stimato come prezzo di acquisto', () => {
    const soggiorno = createLocation({ name: 'Soggiorno', kind: 'room' });
    const entry = createShoppingItem({
      name: 'Divano',
      estimated_price: 899,
      desired_quantity: 1,
      location_id: soggiorno.id,
    });

    const { item, shopping } = convertToItem(entry.id);
    assert.equal(item.name, 'Divano');
    assert.equal(item.purchase_price, 899);
    assert.equal(item.location?.id, soggiorno.id);
    assert.equal(item.status.key, 'owned');
    assert.ok(item.purchase_date);
    assert.equal(shopping.status, 'acquistato');
    assert.equal(shopping.item_id, item.id);
  });

  it('permette di correggere il prezzo effettivo in fase di conversione', () => {
    const entry = createShoppingItem({ name: 'Lampadario', estimated_price: 120 });
    const { item } = convertToItem(entry.id, { purchase_price: 89.9, purchase_date: '2026-05-20' });
    assert.equal(item.purchase_price, 89.9);
    assert.equal(item.purchase_date, '2026-05-20');
  });

  it('impedisce di convertire due volte la stessa voce', () => {
    const entry = createShoppingItem({ name: 'Scrivania' });
    convertToItem(entry.id);
    assert.throws(() => convertToItem(entry.id), /già stato convertito/i);
  });
});

describe('riacquisto dei consumabili', () => {
  it('genera la voce in lista partendo da un consumabile sotto soglia', () => {
    const detersivo = createItem({
      name: 'Detersivo piatti',
      quantity: 1,
      is_consumable: true,
      min_quantity: 2,
      purchase_price: 3.5,
    });

    const entry = restockFromItem(detersivo.id);
    assert.equal(entry.name, 'Detersivo piatti');
    assert.equal(entry.source_item_id, detersivo.id);
    assert.equal(entry.estimated_price, 3.5);
    assert.equal(entry.desired_quantity, 2); // riportare la scorta sopra la soglia
  });

  it('non crea doppioni se la voce di riacquisto e gia aperta', () => {
    const item = createItem({ name: 'Carta igienica', quantity: 0, is_consumable: true, min_quantity: 1 });
    const first = restockFromItem(item.id);
    const second = restockFromItem(item.id);
    assert.equal(first.id, second.id);
  });

  it('alla conversione ricarica la scorta dell oggetto originale', () => {
    const item = createItem({ name: 'Sacchetti aspirapolvere', quantity: 4, is_consumable: true, min_quantity: 2 });
    adjustQuantity(item.id, -3); // ne resta 1

    const entry = restockFromItem(item.id);
    convertToItem(entry.id, { quantity: 5 });

    assert.equal(getItem(item.id).quantity, 6);
    assert.ok(itemHistory(item.id).some((e) => e.note === 'riacquisto'));
  });
});

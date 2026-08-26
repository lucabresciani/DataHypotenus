import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap } from '../src/bootstrap.ts';
import {
  categoryTree,
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from '../src/modules/categories.service.ts';
import {
  childLocations,
  createLocation,
  deleteLocation,
  locationTree,
  updateLocation,
} from '../src/modules/locations.service.ts';
import { createItem, getItem, listItems } from '../src/modules/items.service.ts';
import { createStatus, deleteStatus, listStatuses, updateStatus } from '../src/modules/statuses.service.ts';
import { setSettings } from '../src/modules/settings.service.ts';

before(() => {
  bootstrap({ seed: false });
});

describe('categorie', () => {
  it('costruisce percorsi gerarchici completi', () => {
    const casa = createCategory({ name: 'Casa' });
    const cucina = createCategory({ name: 'Cucina', parent_id: casa.id });
    const pentole = createCategory({ name: 'Pentole', parent_id: cucina.id });
    assert.equal(pentole.path, 'Casa / Cucina / Pentole');
    assert.equal(pentole.depth, 2);
  });

  it('impedisce due sottocategorie con lo stesso nome sotto lo stesso genitore', () => {
    const root = createCategory({ name: 'Duplicati' });
    createCategory({ name: 'Uguale', parent_id: root.id });
    assert.throws(() => createCategory({ name: 'uguale', parent_id: root.id }));
  });

  it('sposta un ramo e ne aggiorna i percorsi', () => {
    const a = createCategory({ name: 'RamoA' });
    const b = createCategory({ name: 'RamoB' });
    const foglia = createCategory({ name: 'Foglia', parent_id: a.id });

    updateCategory(foglia.id, { parent_id: b.id });
    const moved = listCategories().find((c) => c.id === foglia.id);
    assert.equal(moved?.path, 'RamoB / Foglia');
  });

  it('impedisce di spostare una categoria dentro se stessa o in un suo discendente', () => {
    const padre = createCategory({ name: 'Padre' });
    const figlio = createCategory({ name: 'Figlio', parent_id: padre.id });
    assert.throws(() => updateCategory(padre.id, { parent_id: figlio.id }), /dentro se stessa/i);
    assert.throws(() => updateCategory(padre.id, { parent_id: padre.id }), /dentro se stessa/i);
  });

  it('eliminando una categoria le sottocategorie salgono di livello e gli oggetti non si perdono', () => {
    const radice = createCategory({ name: 'Elettronica' });
    const media = createCategory({ name: 'Informatica', parent_id: radice.id });
    const foglia = createCategory({ name: 'Portatili', parent_id: media.id });
    const item = createItem({ name: 'Notebook', category_id: media.id });

    const result = deleteCategory(media.id);
    assert.equal(result.deleted, 1);
    assert.equal(result.movedChildren, 1);

    const updatedLeaf = listCategories().find((c) => c.id === foglia.id);
    assert.equal(updatedLeaf?.path, 'Elettronica / Portatili');
    assert.equal(getItem(item.id).category?.id, radice.id);
  });

  it('con cascade elimina il sottoalbero e lascia gli oggetti senza categoria', () => {
    const radice = createCategory({ name: 'DaCancellare' });
    const figlio = createCategory({ name: 'FiglioDaCancellare', parent_id: radice.id });
    const item = createItem({ name: 'Orfano', category_id: figlio.id });

    const result = deleteCategory(radice.id, { cascade: true });
    assert.equal(result.deleted, 2);
    assert.equal(getItem(item.id).category, null);
  });

  it('propaga il conteggio degli oggetti ai nodi superiori dell albero', () => {
    const radice = createCategory({ name: 'Conteggi' });
    const figlio = createCategory({ name: 'Sotto', parent_id: radice.id });
    createItem({ name: 'ContatoUno', category_id: figlio.id });
    createItem({ name: 'ContatoDue', category_id: figlio.id });

    const node = categoryTree().find((c) => c.id === radice.id);
    assert.equal(node?.item_count, 0);
    assert.equal(node?.total_item_count, 2);
  });
});

describe('posizioni e contenitori', () => {
  it('modella la catena stanza -> mobile -> contenitore', () => {
    const casa = createLocation({ name: 'Casa', kind: 'building' });
    const garage = createLocation({ name: 'Garage', kind: 'room', parent_id: casa.id });
    const scaffale = createLocation({ name: 'Scaffale 3', kind: 'shelf', parent_id: garage.id });
    const scatola = createLocation({ name: 'Trasloco 01', kind: 'container', parent_id: scaffale.id });

    assert.equal(scatola.path, 'Casa / Garage / Scaffale 3 / Trasloco 01');
    assert.equal(scatola.room_name, 'Garage');
    assert.equal(scatola.kind, 'container');
  });

  it('risponde a "cosa c e dentro questa scatola" e "in quale scatola sta"', () => {
    const casa = createLocation({ name: 'Casa2', kind: 'building' });
    const cantina = createLocation({ name: 'Cantina', kind: 'room', parent_id: casa.id });
    const scatola = createLocation({ name: 'Scatola A', kind: 'container', parent_id: cantina.id });

    const piatti = createItem({ name: 'Piatti di ceramica', location_id: scatola.id });
    createItem({ name: 'Bicchieri di vetro', location_id: scatola.id });

    const dentro = listItems({ location_id: scatola.id });
    assert.equal(dentro.total, 2);
    assert.equal(getItem(piatti.id).location?.name, 'Scatola A');
    assert.equal(getItem(piatti.id).location?.path, 'Casa2 / Cantina / Scatola A');
  });

  it('conta gli oggetti di tutto il sottoalbero nella vista ad albero', () => {
    const casa = createLocation({ name: 'Casa3', kind: 'building' });
    const stanza = createLocation({ name: 'Studio', kind: 'room', parent_id: casa.id });
    const cassetto = createLocation({ name: 'Cassetto', kind: 'container', parent_id: stanza.id });
    createItem({ name: 'Penne', location_id: cassetto.id });

    const node = locationTree().find((l) => l.id === casa.id);
    assert.equal(node?.total_item_count, 1);
    assert.equal(childLocations(casa.id).length, 1);
  });

  it('impedisce cicli anche nelle posizioni', () => {
    const a = createLocation({ name: 'Ciclo A', kind: 'room' });
    const b = createLocation({ name: 'Ciclo B', kind: 'furniture', parent_id: a.id });
    assert.throws(() => updateLocation(a.id, { parent_id: b.id }), /dentro se stessa/i);
  });

  it('eliminando una posizione gli oggetti risalgono al livello superiore', () => {
    const stanza = createLocation({ name: 'Ripostiglio', kind: 'room' });
    const mensola = createLocation({ name: 'Mensola', kind: 'shelf', parent_id: stanza.id });
    const item = createItem({ name: 'Scopa', location_id: mensola.id });

    deleteLocation(mensola.id);
    assert.equal(getItem(item.id).location?.id, stanza.id);
  });

  it('rifiuta un tipo di posizione non previsto', () => {
    assert.throws(() => createLocation({ name: 'Strana', kind: 'astronave' as never }), /Tipo di posizione/i);
  });
});

describe('stati degli oggetti', () => {
  it('rifiuta due stati con la stessa etichetta', () => {
    // Bug vero: la chiave veniva controllata, l'etichetta no. "Posseduto"
    // creato a mano prendeva chiave `posseduto` e conviveva con quello di
    // sistema (chiave `owned`), indistinguibile in ogni menu a tendina.
    createStatus({ label: 'Da restituire' });
    assert.throws(() => createStatus({ label: 'Da restituire' }), /Esiste già/i);
    assert.throws(() => createStatus({ label: 'da restituire' }), /Esiste già/i);
  });

  it('rifiuta di rinominare uno stato con l’etichetta di un altro', () => {
    const altro = createStatus({ label: 'In valigia' });
    assert.throws(() => updateStatus(altro.id, { label: 'Da restituire' }), /Esiste già/i);
    // Rinominare uno stato con la propria etichetta non e' un conflitto.
    assert.equal(updateStatus(altro.id, { label: 'In valigia' }).label, 'In valigia');
  });

  it('sposta gli oggetti sullo stato indicato prima di eliminare', () => {
    const temporaneo = createStatus({ label: 'Temporaneo' });
    const item = createItem({ name: 'Oggetto di passaggio', status_id: temporaneo.id });
    const destinazione = listStatuses().find((s) => s.key === 'owned');

    assert.throws(() => deleteStatus(temporaneo.id, undefined), /sostitutivo/i);
    const esito = deleteStatus(temporaneo.id, destinazione?.id);
    assert.equal(esito.moved, 1);
    assert.equal(getItem(item.id).status.id, destinazione?.id);
  });
});

describe('preferenze', () => {
  it('rifiuta una valuta non valida invece di farla arrivare all’interfaccia', () => {
    // Bug vero: una valuta vuota passava, e `Intl.NumberFormat` lanciava
    // dentro il render portando via l'intera pagina.
    assert.throws(() => setSettings({ 'app.default_currency': '' }), /tre lettere/i);
    assert.throws(() => setSettings({ 'app.default_currency': 'EURO' }), /tre lettere/i);
    assert.equal(setSettings({ 'app.default_currency': 'chf' })['app.default_currency'], 'CHF');
  });

  it('tiene le soglie dentro un intervallo sensato', () => {
    assert.throws(() => setSettings({ 'alerts.warranty_days': '0' }), /fra 1 e 365/);
    assert.throws(() => setSettings({ 'alerts.dashboard_limit': '999' }), /fra 3 e 20/);
    assert.equal(setSettings({ 'alerts.warranty_days': '90' })['alerts.warranty_days'], '90');
  });

  it('lascia passare le chiavi che non hanno una regola', () => {
    assert.equal(setSettings({ 'app.qualcosa': 'x' })['app.qualcosa'], 'x');
  });
});

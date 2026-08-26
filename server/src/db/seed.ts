/**
 * Seed iniziale opzionale: categorie, posizioni e tag di partenza.
 *
 * Non e' un dato di sistema: serve solo perche' un database completamente vuoto
 * e' scomodo da usare il primo giorno. Tutto e' rinominabile ed eliminabile.
 * Viene applicato una sola volta, e solo se non esistono gia' categorie o
 * posizioni (cosi' non sovrascrive mai dati reali).
 */
import type { Db } from './connection.ts';
import { createLogger } from '../core/logger.ts';

const log = createLogger('seed');

type CategorySeed = { name: string; icon?: string; children?: CategorySeed[] };

const CATEGORIES: CategorySeed[] = [
  {
    name: 'Cucina',
    icon: 'kitchen',
    children: [
      { name: 'Pentole e padelle' },
      { name: 'Stoviglie' },
      { name: 'Posate' },
      { name: 'Bicchieri e tazze' },
      { name: 'Utensili da cucina' },
      { name: 'Elettrodomestici' },
      { name: 'Contenitori e conservazione' },
      { name: 'Dispensa' },
    ],
  },
  {
    name: 'Bagno',
    icon: 'bath',
    children: [{ name: 'Igiene personale' }, { name: 'Asciugamani' }, { name: 'Farmaci' }, { name: 'Accessori bagno' }],
  },
  {
    name: 'Camera da letto',
    icon: 'bed',
    children: [{ name: 'Biancheria da letto' }, { name: 'Abbigliamento' }, { name: 'Scarpe' }, { name: 'Accessori' }],
  },
  {
    name: 'Soggiorno',
    icon: 'sofa',
    children: [{ name: 'Arredamento' }, { name: 'Illuminazione' }, { name: 'Decorazioni' }, { name: 'Tessili' }],
  },
  {
    name: 'Elettronica',
    icon: 'chip',
    children: [
      { name: 'Informatica' },
      { name: 'Audio e video' },
      { name: 'Telefonia' },
      { name: 'Cavi e adattatori' },
      { name: 'Smart home' },
    ],
  },
  {
    name: 'Pulizia e manutenzione casa',
    icon: 'spray',
    children: [{ name: 'Detersivi' }, { name: 'Attrezzi per pulizia' }, { name: 'Ricambi e filtri' }],
  },
  {
    name: 'Utensili e fai-da-te',
    icon: 'tools',
    children: [{ name: 'Attrezzi manuali' }, { name: 'Attrezzi elettrici' }, { name: 'Ferramenta e minuteria' }],
  },
  { name: 'Documenti', icon: 'doc' },
  { name: 'Sport e tempo libero', icon: 'sport' },
  { name: 'Varie', icon: 'box' },
];

type LocationSeed = { name: string; kind: string; children?: LocationSeed[] };

const LOCATIONS: LocationSeed[] = [
  {
    name: 'Casa',
    kind: 'building',
    children: [
      { name: 'Ingresso', kind: 'room' },
      { name: 'Cucina', kind: 'room' },
      { name: 'Soggiorno', kind: 'room' },
      { name: 'Camera da letto', kind: 'room' },
      { name: 'Bagno', kind: 'room' },
      { name: 'Ripostiglio', kind: 'room' },
      { name: 'Balcone', kind: 'area' },
      { name: 'Cantina', kind: 'room' },
    ],
  },
];

const TAGS = ['importante', 'costoso', 'fragile', 'da-sostituire', 'regalo', 'garanzia', 'lavoro', 'trasloco'];

function insertCategories(db: Db, nodes: CategorySeed[], parentId: number | null, depth = 0): number {
  let count = 0;
  nodes.forEach((node, index) => {
    const res = db.run(
      'INSERT INTO categories (parent_id, name, icon, sort_order) VALUES (?, ?, ?, ?)',
      parentId,
      node.name,
      node.icon ?? null,
      (index + 1) * 10,
    );
    count++;
    if (node.children?.length) count += insertCategories(db, node.children, res.lastInsertRowid, depth + 1);
  });
  return count;
}

function insertLocations(db: Db, nodes: LocationSeed[], parentId: number | null): number {
  let count = 0;
  nodes.forEach((node, index) => {
    const res = db.run(
      'INSERT INTO locations (parent_id, name, kind, sort_order) VALUES (?, ?, ?, ?)',
      parentId,
      node.name,
      node.kind,
      (index + 1) * 10,
    );
    count++;
    if (node.children?.length) count += insertLocations(db, node.children, res.lastInsertRowid);
  });
  return count;
}

export type SeedResult = { applied: boolean; categories: number; locations: number; tags: number; reason?: string };

export function seedStarterData(db: Db, force = false): SeedResult {
  const existing = db.get<{ categories: number; locations: number }>(
    'SELECT (SELECT COUNT(*) FROM categories) AS categories, (SELECT COUNT(*) FROM locations) AS locations',
  );
  if (!force && ((existing?.categories ?? 0) > 0 || (existing?.locations ?? 0) > 0)) {
    return { applied: false, categories: 0, locations: 0, tags: 0, reason: 'esistono già categorie o posizioni' };
  }

  return db.transaction(() => {
    const categories = insertCategories(db, CATEGORIES, null);
    const locations = insertLocations(db, LOCATIONS, null);
    let tags = 0;
    for (const name of TAGS) {
      const r = db.run('INSERT OR IGNORE INTO tags (name) VALUES (?)', name);
      tags += r.changes;
    }
    db.run(
      "INSERT INTO settings (key, value, updated_at) VALUES ('seed.applied_at', ?, ?) " +
        'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      new Date().toISOString(),
      new Date().toISOString(),
    );
    log.info(`seed applicato: ${categories} categorie, ${locations} posizioni, ${tags} tag`);
    return { applied: true, categories, locations, tags };
  });
}

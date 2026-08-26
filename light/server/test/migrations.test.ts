/** Il sistema di migrazioni: lo schema deve evolvere senza ricreare il database. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Db } from '../src/db/connection.ts';
import { appliedMigrations, loadMigrations, migrate, schemaVersion } from '../src/db/migrator.ts';

let tmpDir = '';

const openTempDb = (name: string): Db => new Db(path.join(tmpDir, `${name}.db`));

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'datahypotenus-migr-'));
});

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* cartella temporanea */
  }
});

describe('migrator', () => {
  it('carica le migrazioni in ordine di versione', () => {
    const migrations = loadMigrations();
    assert.ok(migrations.length >= 2);
    const versions = migrations.map((m) => m.version);
    assert.deepEqual(versions, [...versions].sort((a, b) => a - b));
  });

  it('applica tutte le migrazioni su un database vuoto', () => {
    const db = openTempDb('fresh');
    const result = migrate(db);
    assert.ok(result.applied.length >= 2);
    assert.equal(result.alreadyUpToDate, false);
    assert.equal(schemaVersion(db), result.currentVersion);
    db.close();
  });

  it('e idempotente: una seconda esecuzione non applica nulla', () => {
    const db = openTempDb('idempotent');
    migrate(db);
    const second = migrate(db);
    assert.equal(second.applied.length, 0);
    assert.equal(second.alreadyUpToDate, true);
    db.close();
  });

  it('registra checksum e data di applicazione', () => {
    const db = openTempDb('registry');
    migrate(db);
    const applied = appliedMigrations(db);
    assert.ok(applied.length >= 2);
    assert.ok(applied[0]?.checksum.length === 16);
    assert.ok(applied[0]?.applied_at.includes('T'));
    db.close();
  });

  it('blocca l avvio se una migrazione gia applicata viene modificata', () => {
    const db = openTempDb('tampered');
    migrate(db);
    db.run("UPDATE schema_migrations SET checksum = 'alterato' WHERE version = 1");
    assert.throws(() => migrate(db), /cambiata dopo essere stata applicata/i);
    db.close();
  });

  it('crea le strutture attese: tabelle, indice full-text e viste dei percorsi', () => {
    const db = openTempDb('schema');
    migrate(db);

    const names = db
      .all<{ name: string; type: string }>("SELECT name, type FROM sqlite_master WHERE type IN ('table','view')")
      .map((r) => r.name);

    for (const table of [
      'items',
      'categories',
      'locations',
      'item_statuses',
      'tags',
      'item_tags',
      'files',
      'attachments',
      'item_events',
      'shopping_items',
      'maintenance_records',
      'settings',
      'items_fts',
      'category_paths',
      'location_paths',
    ]) {
      assert.ok(names.includes(table), `manca ${table}`);
    }

    const statuses = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM item_statuses');
    assert.ok((statuses?.n ?? 0) >= 10, 'gli stati di sistema devono essere presenti');
    db.close();
  });

  it('le chiavi esterne sono attive e proteggono i riferimenti', () => {
    const db = openTempDb('fk');
    migrate(db);
    assert.throws(
      () => db.run("INSERT INTO items (uid, name, status_id) VALUES ('X', 'Rotto', 9999)"),
      /FOREIGN KEY/i,
    );
    db.close();
  });

  it('la transazione di migrazione fa rollback in caso di errore', () => {
    const db = openTempDb('rollback');
    assert.throws(() => {
      db.transaction(() => {
        db.exec('CREATE TABLE prova (id INTEGER PRIMARY KEY)');
        throw new Error('errore simulato');
      });
    }, /errore simulato/);
    const exists = db.get("SELECT name FROM sqlite_master WHERE name = 'prova'");
    assert.equal(exists, undefined);
    db.close();
  });
});

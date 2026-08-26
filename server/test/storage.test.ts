/** Allegati, garbage collection, backup e ripristino: la parte "data safety". */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { bootstrap } from '../src/bootstrap.ts';
import { config } from '../src/config.ts';
import { getDb } from '../src/db/connection.ts';
import {
  absolutePathOf,
  checkStorage,
  collectGarbage,
  deleteAttachment,
  listAttachments,
  saveAttachment,
} from '../src/modules/attachments.service.ts';
import { createBackup, listBackups, restoreBackup, verifyBackup } from '../src/modules/backup.service.ts';
import { createItem, listItems, purgeItem } from '../src/modules/items.service.ts';

const pdf = (text: string): Buffer => Buffer.from(`%PDF-1.4 ${text}`, 'utf8');

before(() => {
  bootstrap({ seed: false });
});

describe('allegati', () => {
  it('salva un file e lo collega a un oggetto', () => {
    const item = createItem({ name: 'Televisore' });
    const attachment = saveAttachment({
      buffer: pdf('ricevuta tv'),
      filename: 'ricevuta.pdf',
      mime: 'application/pdf',
      entity_type: 'item',
      entity_id: item.id,
      kind: 'receipt',
    });

    assert.equal(attachment.kind, 'receipt');
    assert.equal(attachment.original_filename, 'ricevuta.pdf');
    assert.ok(fs.existsSync(absolutePathOf(attachment.rel_path)));
    assert.equal(listAttachments('item', item.id).length, 1);
  });

  it('deduplica i file identici: due allegati, un solo blob', () => {
    const a = createItem({ name: 'Lavatrice' });
    const b = createItem({ name: 'Asciugatrice' });
    const content = pdf('fattura elettrodomestici');

    const first = saveAttachment({ buffer: content, filename: 'fattura.pdf', mime: 'application/pdf', entity_type: 'item', entity_id: a.id });
    const second = saveAttachment({ buffer: content, filename: 'fattura-copia.pdf', mime: 'application/pdf', entity_type: 'item', entity_id: b.id });

    assert.equal(first.file_id, second.file_id);
    assert.notEqual(first.id, second.id);
    assert.equal(first.sha256, second.sha256);
  });

  it('cancellare un allegato non cancella un file ancora usato altrove', () => {
    const a = createItem({ name: 'Condizionatore' });
    const b = createItem({ name: 'Stufa' });
    const content = pdf('manuale condiviso');

    const first = saveAttachment({ buffer: content, filename: 'manuale.pdf', mime: 'application/pdf', entity_type: 'item', entity_id: a.id });
    saveAttachment({ buffer: content, filename: 'manuale.pdf', mime: 'application/pdf', entity_type: 'item', entity_id: b.id });

    const result = deleteAttachment(first.id);
    assert.equal(result.blob_kept, true);
    assert.ok(fs.existsSync(absolutePathOf(first.rel_path)), 'il file deve restare sul disco');
  });

  it('la garbage collection rimuove solo i blob senza piu riferimenti', () => {
    const item = createItem({ name: 'Monitor' });
    const attachment = saveAttachment({
      buffer: pdf('garanzia monitor unica'),
      filename: 'garanzia.pdf',
      mime: 'application/pdf',
      entity_type: 'item',
      entity_id: item.id,
    });
    const file = absolutePathOf(attachment.rel_path);

    deleteAttachment(attachment.id);
    assert.ok(fs.existsSync(file), 'prima della gc il file resta al suo posto');

    const dry = collectGarbage(true);
    assert.ok(dry.removed_files >= 1);
    assert.ok(fs.existsSync(file), 'la simulazione non deve cancellare nulla');

    collectGarbage(false);
    assert.equal(fs.existsSync(file), false);
  });

  it('la cancellazione definitiva di un oggetto non tocca i file di altri', () => {
    const a = createItem({ name: 'Router' });
    const b = createItem({ name: 'Switch' });
    const shared = pdf('documento condiviso router switch');
    const attachmentA = saveAttachment({ buffer: shared, filename: 'doc.pdf', mime: 'application/pdf', entity_type: 'item', entity_id: a.id });
    saveAttachment({ buffer: shared, filename: 'doc.pdf', mime: 'application/pdf', entity_type: 'item', entity_id: b.id });

    purgeItem(a.id);
    collectGarbage(false);

    assert.ok(fs.existsSync(absolutePathOf(attachmentA.rel_path)), 'il file serve ancora al secondo oggetto');
    assert.equal(listAttachments('item', b.id).length, 1);
  });

  it('la verifica dello store individua i file mancanti sul disco', () => {
    const item = createItem({ name: 'Stampante' });
    const attachment = saveAttachment({
      buffer: pdf('manuale stampante'),
      filename: 'stampante.pdf',
      mime: 'application/pdf',
      entity_type: 'item',
      entity_id: item.id,
    });

    fs.unlinkSync(absolutePathOf(attachment.rel_path));
    const report = checkStorage(false);
    assert.ok(report.missing.some((m) => m.rel_path === attachment.rel_path));
  });
});

describe('backup e ripristino', () => {
  it('crea un backup che contiene database, allegati e manifest verificabile', () => {
    const item = createItem({ name: 'Bicicletta', purchase_price: 450 });
    saveAttachment({
      buffer: pdf('scontrino bici'),
      filename: 'scontrino.pdf',
      mime: 'application/pdf',
      entity_type: 'item',
      entity_id: item.id,
    });

    const backup = createBackup('test');
    const dir = path.join(config.backupsDir, backup.name);

    assert.ok(fs.existsSync(path.join(dir, 'datahypotenus.db')));
    assert.ok(fs.existsSync(path.join(dir, 'manifest.json')));
    assert.ok(backup.files >= 1, 'il backup deve includere gli allegati');

    const verification = verifyBackup(backup.name);
    assert.equal(verification.ok, true);
    assert.equal(verification.database_ok, true);
  });

  it('la verifica fallisce se un file del backup viene alterato', () => {
    const backup = createBackup('da-corrompere');
    const dbFile = path.join(config.backupsDir, backup.name, 'datahypotenus.db');
    fs.appendFileSync(dbFile, 'spazzatura');

    const verification = verifyBackup(backup.name);
    assert.equal(verification.ok, false);
    assert.equal(verification.database_ok, false);
    assert.throws(() => restoreBackup(backup.name), /integrità/i);
  });

  it('ripristina lo stato precedente creando prima una copia di sicurezza', () => {
    const before = createItem({ name: 'Oggetto presente nel backup' });
    const backup = createBackup('prima-del-danno');

    const after = createItem({ name: 'Oggetto creato dopo il backup' });
    assert.equal(listItems({ q: 'Oggetto creato dopo il backup' }).total, 1);

    const report = restoreBackup(backup.name);
    assert.equal(report.database_restored, true);
    assert.ok(report.safety_backup, 'deve esistere un backup di sicurezza pre-ripristino');

    // Dopo il ripristino la connessione punta al database del backup.
    assert.equal(listItems({ q: 'Oggetto creato dopo il backup' }).total, 0);
    assert.equal(listItems({ q: 'Oggetto presente nel backup' }).total, 1);
    assert.ok(getDb().integrityCheck() === 'ok');
    assert.ok(listBackups().length >= 2);
    assert.ok(after.id > before.id);
  });

  it('il ripristino simulato non modifica nulla', () => {
    const item = createItem({ name: 'Oggetto che deve sopravvivere' });
    const backup = createBackup('simulazione');
    createItem({ name: 'Oggetto successivo alla simulazione' });

    const report = restoreBackup(backup.name, { dryRun: true });
    assert.equal(report.dry_run, true);
    assert.equal(report.database_restored, false);
    assert.equal(listItems({ q: 'Oggetto successivo alla simulazione' }).total, 1);
    assert.equal(listItems({ q: 'Oggetto che deve sopravvivere' }).total, 1);
    assert.ok(item.id > 0);
  });
});

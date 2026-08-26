/**
 * Rotte degli allegati: caricamento, download, metadati, manutenzione dello
 * store dei file.
 */
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import { z } from 'zod';
import { idParamSchema, parse, qpBool, qpInt } from '../validation.ts';
import {
  ATTACHMENT_KINDS,
  ENTITY_TYPES,
  absolutePathOf,
  checkStorage,
  collectGarbage,
  deleteAttachment,
  getAttachment,
  listAttachments,
  saveAttachment,
  updateAttachment,
} from '../../modules/attachments.service.ts';
import { badRequest } from '../../core/errors.ts';

const targetSchema = z.object({
  entity_type: z.enum(ENTITY_TYPES).default('item'),
  entity_id: qpInt.positive(),
  kind: z.enum(ATTACHMENT_KINDS).optional(),
  title: z.string().optional(),
});

export async function attachmentRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Caricamento multipart. I metadati (entita', tipo) viaggiano nella query
   * string: cosi' sono disponibili prima di leggere il file e non dipendono
   * dall'ordine dei campi nel form.
   */
  app.post('/attachments', async (request, reply) => {
    const target = parse(targetSchema, request.query, 'parametri dell allegato');
    if (!request.isMultipart()) throw badRequest('Il caricamento richiede una richiesta multipart/form-data');

    const saved = [];
    for await (const part of request.parts()) {
      if (part.type !== 'file') continue;
      const buffer = await part.toBuffer();
      saved.push(
        saveAttachment({
          buffer,
          filename: part.filename || 'allegato',
          mime: part.mimetype || 'application/octet-stream',
          entity_type: target.entity_type,
          entity_id: target.entity_id,
          kind: target.kind,
          title: target.title ?? null,
        }),
      );
    }
    if (saved.length === 0) throw badRequest('Nessun file ricevuto');
    return reply.status(201).send({ attachments: saved });
  });

  app.get('/attachments', async (request) => {
    const { entity_type, entity_id } = parse(
      z.object({ entity_type: z.enum(ENTITY_TYPES).default('item'), entity_id: qpInt.positive() }),
      request.query,
    );
    return { attachments: listAttachments(entity_type, entity_id) };
  });

  app.get('/attachments/:id', async (request) => getAttachment(parse(idParamSchema, request.params).id));

  /** Contenuto del file. `?download=1` forza il salvataggio invece dell'anteprima. */
  app.get('/attachments/:id/file', async (request, reply) => {
    const { id } = parse(idParamSchema, request.params);
    const { download } = parse(z.object({ download: qpBool.optional() }), request.query);
    const attachment = getAttachment(id);
    const file = absolutePathOf(attachment.rel_path);
    if (!fs.existsSync(file)) throw badRequest('Il file non esiste più sul disco (verifica lo store in Impostazioni)');

    const disposition = download ? 'attachment' : 'inline';
    const safeName = attachment.original_filename.replace(/["\r\n]/g, '_');
    return reply
      .type(attachment.mime)
      .header('Content-Disposition', `${disposition}; filename="${safeName}"`)
      // Il contenuto e' immutabile: il nome del file sul disco e' il suo hash.
      .header('Cache-Control', 'private, max-age=31536000, immutable')
      .header('ETag', `"${attachment.sha256}"`)
      .send(fs.createReadStream(file));
  });

  app.patch('/attachments/:id', async (request) => {
    const { id } = parse(idParamSchema, request.params);
    const body = parse(
      z.object({
        title: z.string().nullable().optional(),
        kind: z.enum(ATTACHMENT_KINDS).optional(),
        is_primary: z.boolean().optional(),
        sort_order: z.number().int().optional(),
      }),
      request.body,
      'dati dell allegato',
    );
    return updateAttachment(id, body);
  });

  app.delete('/attachments/:id', async (request) => deleteAttachment(parse(idParamSchema, request.params).id));

  // --- Manutenzione dello store ----------------------------------------------
  app.get('/storage/check', async (request) => {
    const { deep } = parse(z.object({ deep: qpBool.optional() }), request.query);
    return checkStorage(deep ?? false);
  });

  app.post('/storage/gc', async (request) => {
    const { dry_run } = parse(z.object({ dry_run: z.boolean().optional() }), request.body ?? {}, 'parametri');
    return collectGarbage(dry_run ?? false);
  });
}

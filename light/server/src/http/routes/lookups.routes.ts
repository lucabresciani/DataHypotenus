/**
 * Rotte delle entita' di supporto: tag, stati, negozi, impostazioni.
 * Sono piccole e omogenee, quindi stanno insieme invece di quattro file da
 * venti righe.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { idParamSchema, nullableText, parse, qpInt } from '../validation.ts';
import { createTag, deleteTag, listTags, updateTag } from '../../modules/tags.service.ts';
import { createStatus, deleteStatus, listStatuses, updateStatus } from '../../modules/statuses.service.ts';
import { createVendor, deleteVendor, listVendors, updateVendor } from '../../modules/vendors.service.ts';
import { getAllSettings, setSettings } from '../../modules/settings.service.ts';

const tagSchema = z.object({ name: z.string().min(1), color: nullableText.optional() });

const statusSchema = z.object({
  key: z.string().optional(),
  label: z.string().min(1),
  color: nullableText.optional(),
  counts_as_owned: z.boolean().optional(),
  is_wishlist: z.boolean().optional(),
  is_default: z.boolean().optional(),
  sort_order: z.coerce.number().int().optional(),
});

const vendorSchema = z.object({
  name: z.string().min(1),
  website: nullableText.optional(),
  notes: nullableText.optional(),
});

export async function lookupRoutes(app: FastifyInstance): Promise<void> {
  // --- Tag -------------------------------------------------------------------
  app.get('/tags', async () => ({ tags: listTags() }));
  app.post('/tags', async (request, reply) => reply.status(201).send(createTag(parse(tagSchema, request.body, 'dati del tag'))));
  app.patch('/tags/:id', async (request) => {
    const { id } = parse(idParamSchema, request.params);
    return updateTag(id, parse(tagSchema.partial(), request.body, 'dati del tag'));
  });
  app.delete('/tags/:id', async (request) => deleteTag(parse(idParamSchema, request.params).id));

  // --- Stati -----------------------------------------------------------------
  app.get('/statuses', async () => ({ statuses: listStatuses() }));
  app.post('/statuses', async (request, reply) =>
    reply.status(201).send(createStatus(parse(statusSchema, request.body, 'dati dello stato'))),
  );
  app.patch('/statuses/:id', async (request) => {
    const { id } = parse(idParamSchema, request.params);
    return updateStatus(id, parse(statusSchema.partial(), request.body, 'dati dello stato'));
  });
  app.delete('/statuses/:id', async (request) => {
    const { id } = parse(idParamSchema, request.params);
    const { reassign_to } = parse(z.object({ reassign_to: qpInt.optional() }), request.query);
    return deleteStatus(id, reassign_to);
  });

  // --- Negozi ----------------------------------------------------------------
  app.get('/vendors', async () => ({ vendors: listVendors() }));
  app.post('/vendors', async (request, reply) =>
    reply.status(201).send(createVendor(parse(vendorSchema, request.body, 'dati del negozio'))),
  );
  app.patch('/vendors/:id', async (request) => {
    const { id } = parse(idParamSchema, request.params);
    return updateVendor(id, parse(vendorSchema.partial(), request.body, 'dati del negozio'));
  });
  app.delete('/vendors/:id', async (request) => deleteVendor(parse(idParamSchema, request.params).id));

  // --- Impostazioni ----------------------------------------------------------
  app.get('/settings', async () => ({ settings: getAllSettings() }));
  app.put('/settings', async (request) => {
    const values = parse(z.record(z.string(), z.union([z.string(), z.number()])), request.body, 'impostazioni');
    const normalized = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v)]));
    return { settings: setSettings(normalized) };
  });
}

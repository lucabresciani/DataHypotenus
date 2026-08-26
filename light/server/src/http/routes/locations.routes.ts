/** Rotte delle posizioni (stanze, mobili, contenitori). */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { idParamSchema, nullableId, nullableText, parse, qpBool } from '../validation.ts';
import {
  childLocations,
  createLocation,
  deleteLocation,
  getLocation,
  listLocations,
  locationBreadcrumb,
  locationTree,
  LOCATION_KINDS,
  updateLocation,
} from '../../modules/locations.service.ts';
import { listItems } from '../../modules/items.service.ts';
import { listAttachments } from '../../modules/attachments.service.ts';

const bodySchema = z.object({
  name: z.string().min(1, 'Il nome è obbligatorio'),
  parent_id: nullableId.optional(),
  kind: z.enum(LOCATION_KINDS).optional(),
  code: nullableText.optional(),
  notes: nullableText.optional(),
  color: nullableText.optional(),
  sort_order: z.coerce.number().int().optional(),
});

export async function locationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/locations', async () => ({ locations: listLocations(), kinds: LOCATION_KINDS }));

  app.get('/locations/tree', async () => ({ tree: locationTree() }));

  app.post('/locations', async (request, reply) =>
    reply.status(201).send(createLocation(parse(bodySchema, request.body, 'dati della posizione'))),
  );

  app.get('/locations/:id', async (request) => getLocation(parse(idParamSchema, request.params).id));

  /** "Cosa c'e' qui dentro": sotto-posizioni + oggetti (anche annidati). */
  app.get('/locations/:id/contents', async (request) => {
    const { id } = parse(idParamSchema, request.params);
    const { deep, limit } = parse(
      z.object({ deep: qpBool.optional(), limit: z.coerce.number().int().min(1).max(500).optional() }),
      request.query,
    );
    const location = getLocation(id);
    const direct = listItems({ location_id: id, include_sublocations: false, limit: limit ?? 200, sort: 'name', direction: 'asc' });
    const nested = deep
      ? listItems({ location_id: id, include_sublocations: true, limit: limit ?? 500, sort: 'location', direction: 'asc' })
      : null;
    return {
      location,
      breadcrumb: locationBreadcrumb(id),
      children: childLocations(id),
      items: direct.items,
      items_total: direct.total,
      nested_items: nested?.items ?? null,
      nested_total: nested?.total ?? null,
      value: direct.total_value,
      attachments: listAttachments('location', id),
    };
  });

  app.patch('/locations/:id', async (request) => {
    const { id } = parse(idParamSchema, request.params);
    return updateLocation(id, parse(bodySchema.partial(), request.body, 'dati della posizione'));
  });

  app.delete('/locations/:id', async (request) => {
    const { id } = parse(idParamSchema, request.params);
    const { cascade } = parse(z.object({ cascade: qpBool.optional() }), request.query);
    return deleteLocation(id, { cascade });
  });
}

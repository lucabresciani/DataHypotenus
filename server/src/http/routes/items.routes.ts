/** Rotte degli oggetti: CRUD, filtri, azioni rapide, azioni multiple. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, qpBool, qpInt, qpIntList, qpNumber, idParamSchema, nullableId, nullableNumber, nullableText } from '../validation.ts';
import {
  adjustQuantity,
  bulkAction,
  createItem,
  duplicateItem,
  emptyTrash,
  getItem,
  getItemByUid,
  itemHistory,
  listItems,
  purgeItem,
  restoreItem,
  softDeleteItem,
  updateItem,
} from '../../modules/items.service.ts';
import { restockFromItem } from '../../modules/shopping.service.ts';
import { listAttachments } from '../../modules/attachments.service.ts';
import { ITEM_SORTS } from '../../modules/items.types.ts';

const specsSchema = z.record(z.string(), z.string()).nullable();

const itemBodySchema = z.object({
  name: z.string().min(1, 'Il nome è obbligatorio'),
  description: nullableText.optional(),
  category_id: nullableId.optional(),
  location_id: nullableId.optional(),
  status_id: nullableId.optional(),
  status_key: z.string().optional(),
  vendor_id: nullableId.optional(),
  vendor_name: nullableText.optional(),
  quantity: z.coerce.number().min(0).optional(),
  unit: z.string().optional(),
  is_consumable: z.boolean().optional(),
  min_quantity: nullableNumber.optional(),
  initial_quantity: nullableNumber.optional(),
  brand: nullableText.optional(),
  model: nullableText.optional(),
  serial_number: nullableText.optional(),
  sku: nullableText.optional(),
  barcode: nullableText.optional(),
  purchase_price: nullableNumber.optional(),
  current_value: nullableNumber.optional(),
  currency: z.string().max(3).optional(),
  purchase_date: nullableText.optional(),
  product_url: nullableText.optional(),
  warranty_months: nullableNumber.optional(),
  warranty_start: nullableText.optional(),
  warranty_end: nullableText.optional(),
  warranty_notes: nullableText.optional(),
  expiration_date: nullableText.optional(),
  expected_lifespan_months: nullableNumber.optional(),
  notes: nullableText.optional(),
  specs: specsSchema.optional(),
  is_favorite: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  tag_ids: z.array(z.number()).optional(),
  uid: z.string().optional(),
});

const filtersSchema = z.object({
  q: z.string().optional(),
  category_id: qpInt.optional(),
  include_subcategories: qpBool.optional(),
  location_id: qpInt.optional(),
  include_sublocations: qpBool.optional(),
  room_id: qpInt.optional(),
  status_ids: qpIntList.optional(),
  tag_ids: qpIntList.optional(),
  tags_mode: z.enum(['any', 'all']).optional(),
  vendor_id: qpInt.optional(),
  brand: z.string().optional(),
  price_min: qpNumber.optional(),
  price_max: qpNumber.optional(),
  purchased_from: z.string().optional(),
  purchased_to: z.string().optional(),
  is_consumable: qpBool.optional(),
  below_min: qpBool.optional(),
  warranty: z.enum(['none', 'active', 'expiring', 'expired']).optional(),
  expiring_within_days: qpInt.optional(),
  expired: qpBool.optional(),
  has_attachments: qpBool.optional(),
  is_favorite: qpBool.optional(),
  owned_only: qpBool.optional(),
  wishlist_only: qpBool.optional(),
  no_category: qpBool.optional(),
  no_location: qpBool.optional(),
  trash: z.enum(['exclude', 'include', 'only']).optional(),
  sort: z.enum(ITEM_SORTS).optional(),
  direction: z.enum(['asc', 'desc']).optional(),
  limit: qpInt.min(1).max(500).optional(),
  offset: qpInt.min(0).optional(),
});

const bulkSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1, 'Selezionare almeno un oggetto'),
  action: z.discriminatedUnion('action', [
    z.object({ action: z.literal('move'), location_id: nullableId }),
    z.object({ action: z.literal('categorize'), category_id: nullableId }),
    z.object({ action: z.literal('status'), status_id: z.number().int().positive() }),
    z.object({ action: z.literal('add_tags'), tag_ids: z.array(z.number()).optional(), tags: z.array(z.string()).optional() }),
    z.object({ action: z.literal('favorite'), value: z.boolean() }),
    z.object({ action: z.literal('delete') }),
    z.object({ action: z.literal('restore') }),
  ]),
});

export async function itemRoutes(app: FastifyInstance): Promise<void> {
  app.get('/items', async (request) => listItems(parse(filtersSchema, request.query, 'filtri')));

  app.post('/items', async (request, reply) => {
    const item = createItem(parse(itemBodySchema, request.body, 'dati dell’oggetto'));
    return reply.status(201).send(item);
  });

  // Prima delle rotte con :id, altrimenti "bulk" verrebbe letto come un id.
  app.post('/items/bulk', async (request) => {
    const { ids, action } = parse(bulkSchema, request.body, 'dati dell’azione');
    return bulkAction(ids, action);
  });

  app.post('/items/trash/empty', async () => emptyTrash());

  app.get('/items/uid/:uid', async (request) => {
    const { uid } = parse(z.object({ uid: z.string().min(1) }), request.params);
    return getItemByUid(uid);
  });

  app.get('/items/:id', async (request) => {
    const { id } = parse(idParamSchema, request.params);
    return getItem(id);
  });

  app.patch('/items/:id', async (request) => {
    const { id } = parse(idParamSchema, request.params);
    return updateItem(id, parse(itemBodySchema.partial(), request.body, 'dati dell’oggetto'));
  });

  app.delete('/items/:id', async (request) => {
    const { id } = parse(idParamSchema, request.params);
    const { purge } = parse(z.object({ purge: qpBool.optional() }), request.query);
    return purge ? purgeItem(id) : softDeleteItem(id);
  });

  app.post('/items/:id/restore', async (request) => {
    const { id } = parse(idParamSchema, request.params);
    return restoreItem(id);
  });

  app.post('/items/:id/duplicate', async (request) => {
    const { id } = parse(idParamSchema, request.params);
    return duplicateItem(id);
  });

  app.post('/items/:id/quantity', async (request) => {
    const { id } = parse(idParamSchema, request.params);
    const body = parse(
      z.object({ delta: z.number().optional(), value: z.number().min(0).optional() }),
      request.body,
      'dati della quantità',
    );
    if (body.value !== undefined) return updateItem(id, { quantity: body.value });
    return adjustQuantity(id, body.delta ?? 0);
  });

  app.get('/items/:id/history', async (request) => {
    const { id } = parse(idParamSchema, request.params);
    const { limit } = parse(z.object({ limit: qpInt.optional() }), request.query);
    return { events: itemHistory(id, limit ?? 100) };
  });

  app.get('/items/:id/attachments', async (request) => {
    const { id } = parse(idParamSchema, request.params);
    return { attachments: listAttachments('item', id) };
  });

  /** "Da ricomprare": genera la voce nella lista acquisti da un consumabile. */
  app.post('/items/:id/restock', async (request, reply) => {
    const { id } = parse(idParamSchema, request.params);
    return reply.status(201).send(restockFromItem(id));
  });
}

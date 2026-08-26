/** Rotte della lista acquisti, conversione in oggetto compresa. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { idParamSchema, nullableId, nullableNumber, nullableText, parse, qpInt } from '../validation.ts';
import {
  PRIORITIES,
  SHOPPING_STATUSES,
  convertToItem,
  createShoppingItem,
  deleteShoppingItem,
  getShoppingItem,
  listShopping,
  updateShoppingItem,
} from '../../modules/shopping.service.ts';

const bodySchema = z.object({
  name: z.string().min(1, 'Il nome è obbligatorio'),
  notes: nullableText.optional(),
  category_id: nullableId.optional(),
  location_id: nullableId.optional(),
  vendor_id: nullableId.optional(),
  desired_quantity: z.coerce.number().positive().optional(),
  unit: z.string().optional(),
  estimated_price: nullableNumber.optional(),
  currency: z.string().max(3).optional(),
  priority: z.enum(PRIORITIES).optional(),
  status: z.enum(SHOPPING_STATUSES).optional(),
  url: nullableText.optional(),
});

export async function shoppingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/shopping', async (request) => {
    const filters = parse(
      z.object({
        status: z.enum(SHOPPING_STATUSES).optional(),
        priority: z.enum(PRIORITIES).optional(),
        category_id: qpInt.optional(),
        q: z.string().optional(),
      }),
      request.query,
      'filtri',
    );
    return listShopping(filters);
  });

  app.post('/shopping', async (request, reply) =>
    reply.status(201).send(createShoppingItem(parse(bodySchema, request.body, 'dati dell’acquisto'))),
  );

  app.get('/shopping/:id', async (request) => getShoppingItem(parse(idParamSchema, request.params).id));

  app.patch('/shopping/:id', async (request) => {
    const { id } = parse(idParamSchema, request.params);
    return updateShoppingItem(id, parse(bodySchema.partial(), request.body, 'dati dell’acquisto'));
  });

  app.delete('/shopping/:id', async (request) => deleteShoppingItem(parse(idParamSchema, request.params).id));

  /** "L'ho comprato": crea l'oggetto nell'inventario e chiude la voce. */
  app.post('/shopping/:id/convert', async (request) => {
    const { id } = parse(idParamSchema, request.params);
    const options = parse(
      z.object({
        quantity: z.coerce.number().positive().optional(),
        purchase_price: nullableNumber.optional(),
        purchase_date: nullableText.optional(),
        location_id: nullableId.optional(),
        category_id: nullableId.optional(),
        vendor_id: nullableId.optional(),
        status_key: z.string().optional(),
      }),
      request.body ?? {},
      'dati della conversione',
    );
    return convertToItem(id, options);
  });
}

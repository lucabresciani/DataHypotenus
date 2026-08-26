/** Rotte delle categorie (albero). */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { idParamSchema, nullableId, nullableText, parse, qpBool } from '../validation.ts';
import {
  categoryTree,
  createCategory,
  deleteCategory,
  getCategory,
  listCategories,
  updateCategory,
} from '../../modules/categories.service.ts';

const bodySchema = z.object({
  name: z.string().min(1, 'Il nome è obbligatorio'),
  parent_id: nullableId.optional(),
  description: nullableText.optional(),
  icon: nullableText.optional(),
  color: nullableText.optional(),
  sort_order: z.coerce.number().int().optional(),
});

export async function categoryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/categories', async () => ({ categories: listCategories() }));

  app.get('/categories/tree', async () => ({ tree: categoryTree() }));

  app.post('/categories', async (request, reply) =>
    reply.status(201).send(createCategory(parse(bodySchema, request.body, 'dati della categoria'))),
  );

  app.get('/categories/:id', async (request) => getCategory(parse(idParamSchema, request.params).id));

  app.patch('/categories/:id', async (request) => {
    const { id } = parse(idParamSchema, request.params);
    return updateCategory(id, parse(bodySchema.partial(), request.body, 'dati della categoria'));
  });

  app.delete('/categories/:id', async (request) => {
    const { id } = parse(idParamSchema, request.params);
    const { cascade } = parse(z.object({ cascade: qpBool.optional() }), request.query);
    return deleteCategory(id, { cascade });
  });
}

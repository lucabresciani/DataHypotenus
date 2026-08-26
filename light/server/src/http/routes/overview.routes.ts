/** Rotte di sintesi: dashboard, statistiche, ricerca globale. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, qpInt } from '../validation.ts';
import { getDb } from '../../db/connection.ts';
import { buildDashboard } from '../../modules/dashboard.service.ts';
import { buildStats } from '../../modules/stats.service.ts';
import { listItems } from '../../modules/items.service.ts';

export async function overviewRoutes(app: FastifyInstance): Promise<void> {
  app.get('/dashboard', async () => buildDashboard());

  app.get('/stats', async (request) => {
    const { months } = parse(z.object({ months: qpInt.min(1).max(60).optional() }), request.query);
    return buildStats(months ?? 12);
  });

  /**
   * Ricerca globale (la barra sempre visibile e la palette Ctrl+K).
   * Cerca in parallelo fra oggetti, categorie, posizioni, tag e lista acquisti:
   * l'utente non deve sapere in anticipo "dove" sta cio' che cerca.
   */
  app.get('/search', async (request) => {
    const { q, limit } = parse(
      z.object({ q: z.string().min(1, 'Testo di ricerca mancante'), limit: qpInt.min(1).max(50).optional() }),
      request.query,
      'parametri di ricerca',
    );
    const db = getDb();
    const max = limit ?? 8;
    const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;

    const items = listItems({ q, limit: max, sort: 'updated_at', direction: 'desc' });

    const categories = db.all<{ id: number; name: string; path: string; item_count: number }>(
      `SELECT c.id, c.name, p.path,
              (SELECT COUNT(*) FROM items i WHERE i.category_id = c.id AND i.deleted_at IS NULL) AS item_count
       FROM categories c LEFT JOIN category_paths p ON p.id = c.id
       WHERE c.name LIKE ? ESCAPE '\\' OR p.path LIKE ? ESCAPE '\\'
       ORDER BY p.path LIMIT ?`,
      like,
      like,
      max,
    );

    const locations = db.all<{ id: number; name: string; path: string; kind: string; item_count: number }>(
      `SELECT l.id, l.name, p.path, l.kind,
              (SELECT COUNT(*) FROM items i WHERE i.location_id = l.id AND i.deleted_at IS NULL) AS item_count
       FROM locations l LEFT JOIN location_paths p ON p.id = l.id
       WHERE l.name LIKE ? ESCAPE '\\' OR p.path LIKE ? ESCAPE '\\' OR l.code LIKE ? ESCAPE '\\'
       ORDER BY p.path LIMIT ?`,
      like,
      like,
      like,
      max,
    );

    const tags = db.all<{ id: number; name: string }>(
      `SELECT id, name FROM tags WHERE name LIKE ? ESCAPE '\\' ORDER BY name LIMIT ?`,
      like,
      max,
    );

    const shopping = db.all<{ id: number; name: string; status: string; priority: string }>(
      `SELECT id, name, status, priority FROM shopping_items
       WHERE name LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT ?`,
      like,
      max,
    );

    return {
      query: q,
      items: items.items,
      items_total: items.total,
      categories,
      locations,
      tags,
      shopping,
    };
  });
}

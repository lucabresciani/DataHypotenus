/** Registrazione di tutte le rotte sotto /api/v1. */
import type { FastifyInstance } from 'fastify';
import { itemRoutes } from './items.routes.ts';
import { categoryRoutes } from './categories.routes.ts';
import { locationRoutes } from './locations.routes.ts';
import { lookupRoutes } from './lookups.routes.ts';
import { attachmentRoutes } from './attachments.routes.ts';
import { shoppingRoutes } from './shopping.routes.ts';
import { overviewRoutes } from './overview.routes.ts';
import { maintenanceRoutes } from './maintenance.routes.ts';
import { getDb } from '../../db/connection.ts';
import { schemaVersion } from '../../db/migrator.ts';
import { config } from '../../config.ts';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  /** Diagnostica: utile anche come verifica rapida che il server sia vivo. */
  app.get('/health', async () => {
    const db = getDb();
    return {
      status: 'ok',
      app: 'datahypotenus',
      schema_version: schemaVersion(db),
      database: config.dbPath,
      data_dir: config.dataDir,
      integrity: db.integrityCheck(),
      uptime_seconds: Math.round(process.uptime()),
      node: process.version,
    };
  });

  await app.register(itemRoutes);
  await app.register(categoryRoutes);
  await app.register(locationRoutes);
  await app.register(lookupRoutes);
  await app.register(attachmentRoutes);
  await app.register(shoppingRoutes);
  await app.register(overviewRoutes);
  await app.register(maintenanceRoutes);
}

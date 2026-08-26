/**
 * Rotte di "manutenzione dei dati": backup, ripristino, import, export.
 * Sono le operazioni che proteggono il patrimonio informativo, quindi ognuna
 * risponde con un rapporto esplicito di cosa ha fatto.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, qpBool } from '../validation.ts';
import {
  createBackup,
  deleteBackup,
  listBackups,
  readManifest,
  restoreBackup,
  verifyBackup,
} from '../../modules/backup.service.ts';
import { exportItemsCsv, exportJson, importItemsCsv, importJson } from '../../modules/transfer.service.ts';
import { seedStarterData } from '../../db/seed.ts';
import { getDb } from '../../db/connection.ts';
import { badRequest } from '../../core/errors.ts';

const nameParam = z.object({ name: z.string().regex(/^[A-Za-z0-9._-]+$/, 'Nome di backup non valido') });

export async function maintenanceRoutes(app: FastifyInstance): Promise<void> {
  // --- Backup ----------------------------------------------------------------
  app.get('/backups', async () => ({ backups: listBackups() }));

  app.post('/backups', async (request, reply) => {
    const { label } = parse(z.object({ label: z.string().optional() }), request.body ?? {}, 'parametri del backup');
    return reply.status(201).send(createBackup(label));
  });

  app.get('/backups/:name', async (request) => readManifest(parse(nameParam, request.params).name));

  app.post('/backups/:name/verify', async (request) => verifyBackup(parse(nameParam, request.params).name));

  app.post('/backups/:name/restore', async (request) => {
    const { name } = parse(nameParam, request.params);
    const { dry_run } = parse(z.object({ dry_run: z.boolean().optional() }), request.body ?? {}, 'parametri');
    return restoreBackup(name, { dryRun: dry_run ?? false });
  });

  app.delete('/backups/:name', async (request) => deleteBackup(parse(nameParam, request.params).name));

  // --- Export ----------------------------------------------------------------
  app.get('/export/json', async (request, reply) => {
    const { history } = parse(z.object({ history: qpBool.optional() }), request.query);
    const bundle = exportJson({ includeHistory: history ?? true });
    const stamp = new Date().toISOString().slice(0, 10);
    return reply
      .header('Content-Disposition', `attachment; filename="datahypotenus-${stamp}.json"`)
      .type('application/json')
      .send(bundle);
  });

  app.get('/export/csv', async (_request, reply) => {
    const stamp = new Date().toISOString().slice(0, 10);
    return reply
      .header('Content-Disposition', `attachment; filename="datahypotenus-oggetti-${stamp}.csv"`)
      .type('text/csv; charset=utf-8')
      .send(exportItemsCsv());
  });

  // --- Import ----------------------------------------------------------------
  app.post('/import/csv', async (request) => {
    const mode = parse(z.object({ mode: z.enum(['merge', 'create_only']).optional() }), request.query).mode ?? 'merge';

    // Accetta sia un upload multipart sia il CSV grezzo nel corpo.
    if (request.isMultipart()) {
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          const buffer = await part.toBuffer();
          return importItemsCsv(buffer.toString('utf8'), mode);
        }
      }
      throw badRequest('Nessun file CSV ricevuto');
    }
    const body = request.body;
    const csv = typeof body === 'string' ? body : (body as { csv?: string })?.csv;
    if (!csv) throw badRequest('Nessun contenuto CSV ricevuto');
    return importItemsCsv(csv, mode);
  });

  app.post('/import/json', async (request) => {
    const mode = parse(z.object({ mode: z.enum(['merge', 'create_only']).optional() }), request.query).mode ?? 'merge';
    if (request.isMultipart()) {
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          const buffer = await part.toBuffer();
          return importJson(JSON.parse(buffer.toString('utf8')), mode);
        }
      }
      throw badRequest('Nessun file JSON ricevuto');
    }
    return importJson(request.body, mode);
  });

  // --- Seed ------------------------------------------------------------------
  app.post('/seed', async (request) => {
    const { force } = parse(z.object({ force: z.boolean().optional() }), request.body ?? {}, 'parametri');
    return seedStarterData(getDb(), force ?? false);
  });
}

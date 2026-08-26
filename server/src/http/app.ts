/**
 * Composizione dell'applicazione HTTP.
 *
 * Il server fa tre cose: espone /api/v1, serve i file degli allegati e serve
 * l'interfaccia compilata (web/dist). Un solo processo, una sola porta: e'
 * quello che serve per un'applicazione personale locale.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import fastifyCors from '@fastify/cors';
import fs from 'node:fs';
import { config } from '../config.ts';
import { AppError } from '../core/errors.ts';
import { createLogger } from '../core/logger.ts';
import { registerRoutes } from './routes/index.ts';

const log = createLogger('http');

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // il logging applicativo passa da core/logger.ts
    bodyLimit: config.maxUploadBytes,
    trustProxy: false,
  });

  await app.register(fastifyCors, {
    // In sviluppo il frontend gira su Vite (porta diversa): serve il CORS.
    // In produzione tutto arriva dalla stessa origine e questa lista resta vuota.
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173', ...config.corsOrigins],
  });

  await app.register(fastifyMultipart, {
    limits: { fileSize: config.maxUploadBytes, files: 10 },
  });

  // --- Gestione errori centralizzata -----------------------------------------
  // Nessun errore deve arrivare al browser come pagina bianca o stack trace.
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      if (error.statusCode >= 500) log.error(`${request.method} ${request.url}`, error);
      else log.debug(`${request.method} ${request.url} -> ${error.code}`, error.message);
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details ?? undefined },
      });
    }

    // Errori di Fastify (payload malformato, limite di upload, ...): portano
    // con se' uno statusCode, ma il tipo e' `unknown`.
    const fastifyError = error as { statusCode?: number; message?: string };
    const statusCode = typeof fastifyError.statusCode === 'number' ? fastifyError.statusCode : 500;
    if (statusCode >= 500) log.error(`errore non gestito su ${request.method} ${request.url}`, error);

    return reply.status(statusCode).send({
      error: {
        code: statusCode >= 500 ? 'internal_error' : 'bad_request',
        message:
          statusCode >= 500
            ? 'Errore interno del server. I dettagli sono nel file di log.'
            : (fastifyError.message ?? 'Richiesta non valida'),
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.status(404).send({ error: { code: 'not_found', message: `Endpoint inesistente: ${request.url}` } });
    }
    // Rotte dell'interfaccia: le gestisce il router lato client.
    const indexFile = `${config.webDistDir}/index.html`;
    if (fs.existsSync(indexFile)) return reply.type('text/html').send(fs.readFileSync(indexFile));
    return reply
      .status(404)
      .type('text/html')
      .send(
        '<h1>datahypotenus</h1><p>Interfaccia non compilata. Esegui <code>npm run build</code>, ' +
          'oppure usa <code>npm run dev</code> e apri http://localhost:5173</p>',
      );
  });

  await app.register(registerRoutes, { prefix: '/api/v1' });

  // --- Interfaccia compilata --------------------------------------------------
  if (fs.existsSync(config.webDistDir)) {
    await app.register(fastifyStatic, { root: config.webDistDir, prefix: '/' });
    log.debug(`interfaccia servita da ${config.webDistDir}`);
  }

  return app;
}

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './env.js';
import { apiRoutes } from './routes/api.js';
import { initPush } from './services/notify.js';
import { startScheduler } from './services/scheduler.js';

async function main(): Promise<void> {
  const app = Fastify({
    logger: {
      level: env.logLevel,
    },
  });

  app.log.info(`İşBul sunucusu başlıyor (port ${env.port})`);

  await app.register(cors, {
    origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',').map((v) => v.trim()),
  });

  await app.register(apiRoutes);

  app.get('/', async () => ({
    name: 'İşBul API',
    ok: true,
    docs: '/api/meta',
  }));

  app.setErrorHandler((error, _request, reply) => {
    const err = error as Error & { statusCode?: number };
    const status = err.statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    reply.code(status).send({ error: err.message });
  });

  await initPush(app.log);
  const stopScheduler = startScheduler(app.log);

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} alındı, kapatılıyor...`);
    stopScheduler();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: env.port, host: env.host });
  app.log.info(`Hazır: http://localhost:${env.port}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
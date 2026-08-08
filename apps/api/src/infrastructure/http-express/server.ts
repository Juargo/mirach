import 'dotenv/config';
import { loadEnv } from '../../config/env';
import { createContainer } from '../../composition/container';
import { assertGoogleAuthActivationConsistency } from '../../composition/assert-google-auth-activation-consistency';
import { createApp } from './app';
import { programarLimpiezaDemo } from '../scheduler/demo-cleanup-scheduler';

/**
 * Bootstrap del server Express (ADR-028/029) — el entrypoint desplegado en Render.
 *
 * `loadEnv()` corre UNA VEZ acá, después de `dotenv/config` — es el único
 * read point de `process.env` para todo el grafo de boot. `env` se inyecta
 * hacia abajo: `createContainer(env)` → `createPrismaClient(env)` /
 * `crearAuth(prisma, env)`; `createApp(container, env)`. Si `loadEnv()` lanza
 * (config inválida), el proceso nunca llega a levantar el server —
 * fail-fast, fail-loud, antes de conectar a nada.
 *
 * El container es dueño del ciclo de vida de Prisma: se conecta al arrancar y
 * se desconecta en el apagado ordenado (SIGTERM en Render / SIGINT en local).
 * Acá también se agenda la limpieza diaria de demos (node-cron), que reemplaza
 * al `@Cron` de Nest.
 */
function bootstrap(): void {
  const env = loadEnv();
  const container = createContainer(env);
  // C2.6a (4R C1 carry-forward R4): falla el boot si las credenciales de
  // Google están presentes pero container.googleAuth no se construyó — ver
  // el docstring de assertGoogleAuthActivationConsistency.
  assertGoogleAuthActivationConsistency(env, container.googleAuth);
  const app = createApp(container, env);
  const port = env.PORT;

  const tareaLimpiezaDemo = programarLimpiezaDemo(container.demoCleanup);

  const server = app.listen(port, () => {
    container.logger.info('API (Express) escuchando', { port });
  });

  const shutdown = async (): Promise<void> => {
    server.close();
    await tareaLimpiezaDemo.stop();
    await container.shutdown();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

void bootstrap();

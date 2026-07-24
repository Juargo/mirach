import 'dotenv/config';
import { createContainer } from '../../composition/container';
import { createApp } from './app';
import { programarLimpiezaDemo } from '../scheduler/demo-cleanup-scheduler';

/**
 * Bootstrap del server Express (ADR-028) — el entrypoint desplegado en Render.
 *
 * El container es dueño del ciclo de vida de Prisma: se conecta al arrancar y
 * se desconecta en el apagado ordenado (SIGTERM en Render / SIGINT en local).
 * Acá también se agenda la limpieza diaria de demos (node-cron), que reemplaza
 * al `@Cron` de Nest.
 */
async function bootstrap(): Promise<void> {
  const container = createContainer();
  const app = createApp(container);
  const port = Number(process.env.PORT ?? 3000);

  const tareaLimpiezaDemo = programarLimpiezaDemo(container.demoCleanup);

  const server = app.listen(port, () => {
    console.log(`API (Express) escuchando en :${port}`);
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

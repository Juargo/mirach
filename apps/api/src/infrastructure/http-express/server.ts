import 'dotenv/config';
import { createContainer } from '../../composition/container';
import { createApp } from './app';

/**
 * Bootstrap del server Express (ADR-028).
 *
 * NO es todavía el entrypoint desplegado: convive con `main.ts` (Nest) en la
 * rama hasta el cutover (Slice 8), donde Render pasa a apuntar acá.
 *
 * El container es dueño del ciclo de vida de Prisma: se conecta al arrancar y
 * se desconecta en el apagado ordenado (SIGTERM en Render / SIGINT en local).
 */
async function bootstrap(): Promise<void> {
  const container = createContainer();
  const app = createApp(container);
  const port = Number(process.env.PORT ?? 3000);

  const server = app.listen(port, () => {
    console.log(`API (Express) escuchando en :${port}`);
  });

  const shutdown = async (): Promise<void> => {
    server.close();
    await container.shutdown();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

void bootstrap();

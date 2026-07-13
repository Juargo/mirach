// Polyfill de Reflect.metadata que NestJS necesita para el DI basado en
// decoradores. Debe cargarse antes de importar cualquier módulo con `@Injectable`
// (Vitest ejecuta setupFiles antes del grafo de tests). Ver vitest.config.ts.
import 'reflect-metadata';

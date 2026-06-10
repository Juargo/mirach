/**
 * Composition Root — ensamblado del grafo de dependencias.
 *
 * Este es el único lugar del proyecto donde todas las capas
 * se "tocan": infrastructure implementa los puertos de application,
 * y application usa el dominio.
 *
 * En NestJS, el AppModule actúa como Composition Root a través
 * del sistema de inyección de dependencias (providers).
 *
 * A medida que se agreguen módulos (IngestaModule, etc.),
 * se registrarán aquí.
 *
 * @see src/app.module.ts
 */
export {};

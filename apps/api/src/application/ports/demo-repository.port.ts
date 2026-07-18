/** CrearDemoInput — datos mínimos para crear un usuario demo (DEMO-AUTH-01/06). */
export interface CrearDemoInput {
  readonly nombre: string;
}

/** CrearDemoResult — identificadores creados, para wiring posterior (sesión). */
export interface CrearDemoResult {
  readonly userId: string;
  readonly accountId: string;
}

/**
 * IDemoRepository — puerto de creación atómica de la cadena de datos demo
 * (User+Account+Ingesta+Transacciones, design.md §5). La implementación debe
 * envolver toda la creación en una única transacción de Prisma (DEMO-DATA-04).
 */
export interface IDemoRepository {
  crear(input: CrearDemoInput): Promise<CrearDemoResult>;
}

/** Injection token — interfaces are erased at runtime. */
export const DEMO_REPOSITORY = 'IDemoRepository';

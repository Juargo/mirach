/**
 * CrearDemoInput — datos mínimos para crear un usuario demo (DEMO-AUTH-01/06).
 *
 * `tokenHash`/`expiresAt` viajan pre-computados desde `CrearDemoUseCase` para
 * que la implementación cree la `Session` DENTRO de la misma `$transaction`
 * que User/Account/Ingesta/Transacciones (DEMO-DATA-04 extendido, fix
 * crítico judgment-day) — así no puede quedar un usuario demo huérfano si el
 * insert de la sesión falla: todo el bloque rueda atrás junto.
 */
export interface CrearDemoInput {
  readonly nombre: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

/** CrearDemoResult — identificadores creados (para logging/diagnóstico, la sesión ya quedó persistida). */
export interface CrearDemoResult {
  readonly userId: string;
  readonly accountId: string;
}

/**
 * IDemoRepository — puerto de creación atómica de la cadena de datos demo
 * (User+Account+Ingesta+Transacciones+Session, design.md §5). La
 * implementación debe envolver TODA la creación — incluida la sesión — en
 * una única transacción de Prisma (DEMO-DATA-04).
 */
export interface IDemoRepository {
  crear(input: CrearDemoInput): Promise<CrearDemoResult>;
}

/** Injection token — interfaces are erased at runtime. */
export const DEMO_REPOSITORY = 'IDemoRepository';

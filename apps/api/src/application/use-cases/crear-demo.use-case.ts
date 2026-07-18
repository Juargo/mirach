import { randomBytes } from 'node:crypto';
import { calcularExpiracion } from '../../domain/value-objects/duracion-sesion';
import { IDemoRepository } from '../ports/demo-repository.port';
import { ISessionRepository } from '../ports/session-repository.port';
import { ISessionTokenService } from '../ports/session-token.port';
import { IReloj } from '../ports/reloj.port';

export interface CrearDemoUseCaseResult {
  readonly token: string;
  readonly userId: string;
  readonly expiresAt: Date;
}

/**
 * generarNombreDemo — nombre visible del usuario demo (DEMO-AUTH-06),
 * formato `Demo-{sufijo}`. El sufijo por defecto es hex aleatorio de 12
 * caracteres (`randomBytes(6)`) — suficiente entropía para que la
 * probabilidad de colisión con otro usuario demo sea despreciable, sin
 * depender de una librería de cuid externa (el workspace pnpm aislado exige
 * declarar cada dependencia directa — ADR-006/CLAUDE.md — y esto evita sumar
 * una solo para un sufijo cosmético).
 */
export function generarNombreDemo(sufijo: string = randomBytes(6).toString('hex')): string {
  return `Demo-${sufijo}`;
}

/**
 * CrearDemoUseCase — orquesta la creación de un usuario demo + su sesión
 * (DEMO-AUTH-01, design.md §Data Flow). Nunca lanza por validación (no hay
 * input de negocio que pueda ser inválido); las fallas de infraestructura
 * propagan como excepción, igual que `LoginUseCase`/`LogoutUseCase` — el
 * controller las traduce a 500.
 */
export class CrearDemoUseCase {
  constructor(
    private readonly demoRepo: IDemoRepository,
    private readonly sessions: ISessionRepository,
    private readonly tokens: ISessionTokenService,
    private readonly reloj: IReloj,
  ) {}

  async execute(): Promise<CrearDemoUseCaseResult> {
    const nombre = generarNombreDemo();
    const { userId } = await this.demoRepo.crear({ nombre });

    const { token, tokenHash } = this.tokens.generar();
    const expiresAt = calcularExpiracion(this.reloj.ahora());

    await this.sessions.crear({ userId, tokenHash, expiresAt });

    return { token, userId, expiresAt };
  }
}

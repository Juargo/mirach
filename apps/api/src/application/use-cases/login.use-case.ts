import { Result } from '../../shared/result';
import { Email } from '../../domain/value-objects/email';
import { calcularExpiracion } from '../../domain/value-objects/duracion-sesion';
import { CredencialesInvalidasError } from '../../domain/errors/credenciales-invalidas.error';
import { IUserCredentialRepository } from '../ports/user-credential-repository.port';
import { IPasswordHasher } from '../ports/password-hasher.port';
import { ISessionRepository } from '../ports/session-repository.port';
import { ISessionTokenService } from '../ports/session-token.port';
import { IReloj } from '../ports/reloj.port';

export interface LoginUseCaseResult {
  readonly token: string;
  readonly userId: string;
  readonly expiresAt: Date;
}

/**
 * Constant fake hash consulted by the dummy `verificar()` call on the
 * unknown-email / invalid-email-format branches (AUTH-02 timing equalization).
 * Never a real user's hash — just a plausible-shaped opaque string so the
 * hasher's real comparison work runs on every failure branch.
 */
const HASH_DUMMY_PARA_TIMING =
  '$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXlzYWx0ZHVtbXk$ZHVtbXlkdW1teWR1bW15ZHVtbXlkdW1teWR1bW15ZHU';

/**
 * LoginUseCase — orquesta el login (AUTH-01..04) per design §4.
 *
 * Todas las ramas de fallo (email inválido, email desconocido, contraseña
 * incorrecta) colapsan al mismo `CredencialesInvalidasError` (AUTH-02, no
 * enumeración). Las dos primeras ramas invocan un `verificar()` "dummy"
 * contra un hash constante para igualar la forma temporal del camino real.
 *
 * Nunca lanza. Nunca persiste ni retorna el token en ningún otro lugar que
 * el valor de éxito — el controller decide qué hacer con él (cookie/body).
 */
export class LoginUseCase {
  constructor(
    private readonly creds: IUserCredentialRepository,
    private readonly hasher: IPasswordHasher,
    private readonly sessions: ISessionRepository,
    private readonly tokens: ISessionTokenService,
    private readonly reloj: IReloj,
  ) {}

  async execute(input: {
    emailRaw: string;
    password: string;
  }): Promise<Result<LoginUseCaseResult, CredencialesInvalidasError>> {
    const emailResult = Email.crear(input.emailRaw);

    if (emailResult.isFail()) {
      await this.hasher.verificar(input.password, HASH_DUMMY_PARA_TIMING);
      return Result.fail(new CredencialesInvalidasError());
    }

    const cred = await this.creds.buscarPorEmail(emailResult.getValue());

    if (cred === null) {
      await this.hasher.verificar(input.password, HASH_DUMMY_PARA_TIMING);
      return Result.fail(new CredencialesInvalidasError());
    }

    const passwordValida = await this.hasher.verificar(
      input.password,
      cred.passwordHash,
    );

    if (!passwordValida) {
      return Result.fail(new CredencialesInvalidasError());
    }

    const { token, tokenHash } = this.tokens.generar();
    const expiresAt = calcularExpiracion(this.reloj.ahora());

    await this.sessions.crear({ userId: cred.userId, tokenHash, expiresAt });

    return Result.ok({ token, userId: cred.userId, expiresAt });
  }
}

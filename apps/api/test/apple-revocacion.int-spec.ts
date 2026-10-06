/**
 * apple-revocacion.int-spec.ts — Sign in with Apple, T4, contra Postgres REAL.
 *
 * El cliente de la API REST de Apple es un doble (nunca red real; su
 * contrato HTTP lo cubre `apple-auth-http.client.spec.ts`). Todo lo demás es
 * real: `LoginConAppleUseCase`, repos Prisma, `AesGcmCryptoService`,
 * `EliminarCuentaUseCase` y `PrismaCuentaRepository`. Prueba:
 *  - el refresh token queda CIFRADO en `User.appleRefreshToken` (no en claro),
 *    se sobrescribe en el siguiente login y un canje fallido no lo toca;
 *  - al eliminar la cuenta el revocador recibe el token en claro ANTES de que
 *    desaparezcan las filas, y después la cuenta no existe.
 *
 * Requiere BD real: `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration -- apple-revocacion`.
 */
import 'dotenv/config';
import type { PrismaClient } from '@prisma/client';
import type { Mock } from 'vitest';
import { loadEnv } from '../src/config/env';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { Result } from '../src/shared/result';
import { LoginConAppleUseCase } from '../src/application/use-cases/login-con-apple.use-case';
import { EliminarCuentaUseCase } from '../src/application/use-cases/eliminar-cuenta.use-case';
import { AppleAuthFallidoError } from '../src/domain/errors/apple-auth-fallido.error';
import type { IClienteAppleAuth } from '../src/application/ports/cliente-apple-auth.port';
import { PrismaIdentidadAppleRepository } from '../src/infrastructure/persistence/prisma-identidad-apple.repository';
import { PrismaRefreshTokenAppleRepository } from '../src/infrastructure/persistence/prisma-refresh-token-apple.repository';
import { PrismaSessionRepository } from '../src/infrastructure/persistence/prisma-session.repository';
import { PrismaCuentaRepository } from '../src/infrastructure/persistence/prisma-cuenta.repository';
import { HmacBlindIndexService } from '../src/infrastructure/persistence/hmac-blind-index.service';
import { AesGcmCryptoService } from '../src/infrastructure/persistence/aes-gcm-crypto.service';
import { AppleRevocadorIdentidadExterna } from '../src/infrastructure/identity/apple-revocador-identidad-externa';
import { Sha256SessionTokenService } from '../src/infrastructure/http/auth/sha256-session-token.service';
import { SystemReloj } from '../src/infrastructure/http/auth/system-reloj';
import { deriveBlindIndexKey } from '../src/composition/derive-blind-index-key';
import { NoOpLogger } from './support/logger.double';

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';
const RUN_ID = `apple-revocacion-int-${Date.now()}`;
const SUB = `sub-${RUN_ID}`;
const EMAIL = `${RUN_ID}@example.com`;
const IDENTIDAD = {
  sub: SUB,
  email: EMAIL,
  emailVerificado: true,
  emailPrivado: false,
};

const canjeDe = (refreshToken: string) => ({ refreshToken, idToken: 'idt' });

describe('Apple refresh token (integration — real DB)', () => {
  let prisma: PrismaClient;
  let crypto: AesGcmCryptoService;
  let login: LoginConAppleUseCase;
  let eliminar: (cliente: IClienteAppleAuth) => EliminarCuentaUseCase;
  let subEnCurso = SUB;
  let canje: Mock<IClienteAppleAuth['intercambiarCodigo']>;

  beforeAll(async () => {
    if (!ALLOW) return;

    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    const clave = Buffer.from(env.ENCRYPTION_KEY, 'base64');
    crypto = new AesGcmCryptoService(clave);
    canje = vi.fn<IClienteAppleAuth['intercambiarCodigo']>();
    const cliente: IClienteAppleAuth = {
      intercambiarCodigo: (code) => canje(code),
      revocarRefreshToken: vi.fn(),
    };
    login = new LoginConAppleUseCase(
      new PrismaIdentidadAppleRepository(
        prisma,
        new HmacBlindIndexService(deriveBlindIndexKey(clave)),
        crypto,
      ),
      new PrismaSessionRepository(prisma),
      new Sha256SessionTokenService(),
      new SystemReloj(),
      new NoOpLogger(),
      cliente,
      new PrismaRefreshTokenAppleRepository(prisma, crypto),
      // El id_token del canje se verifica con RSA/JWKS (cubierto en unit); acá
      // el doble devuelve el sub del login para ejercitar la persistencia real.
      { verificarSubDelCanje: async () => Result.ok(subEnCurso) },
    );
    eliminar = (clienteRevocacion) =>
      new EliminarCuentaUseCase(
        new PrismaCuentaRepository(prisma),
        new AppleRevocadorIdentidadExterna(
          new PrismaRefreshTokenAppleRepository(prisma, crypto),
          clienteRevocacion,
          new NoOpLogger(),
        ),
        new NoOpLogger(),
      );
  });

  afterAll(async () => {
    if (!ALLOW) return;
    const users = await prisma.user.findMany({
      where: { appleSub: SUB },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    if (ids.length > 0) {
      await new PrismaCuentaRepository(prisma).eliminar(ids[0]);
    }
    await prisma.$disconnect();
  });

  const guardado = async (userId: string) =>
    (
      await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { appleRefreshToken: true },
      })
    ).appleRefreshToken;

  it('login con code: guarda el refresh token CIFRADO; el siguiente login lo sobrescribe; un canje fallido no lo toca', async () => {
    if (!ALLOW) return;

    canje.mockResolvedValueOnce(Result.ok(canjeDe('rt-uno-SECRETO')));
    const alta = await login.execute(IDENTIDAD, 'Int Spec', 'code-1');
    const userId = alta.getValue().userId;

    const cifrado = await guardado(userId);
    expect(cifrado).not.toBeNull();
    expect(cifrado).not.toContain('rt-uno');
    expect(crypto.decrypt(cifrado as string)).toBe('rt-uno-SECRETO');

    canje.mockResolvedValueOnce(Result.ok(canjeDe('rt-dos-SECRETO')));
    await login.execute(IDENTIDAD, null, 'code-2');
    expect(crypto.decrypt((await guardado(userId)) as string)).toBe(
      'rt-dos-SECRETO',
    );

    canje.mockResolvedValueOnce(
      Result.fail(new AppleAuthFallidoError('invalid_grant')),
    );
    const sinCanje = await login.execute(IDENTIDAD, null, 'code-3');
    expect(sinCanje.isOk()).toBe(true);
    expect(crypto.decrypt((await guardado(userId)) as string)).toBe(
      'rt-dos-SECRETO',
    );

    await login.execute(IDENTIDAD, null);
    expect(canje).toHaveBeenCalledTimes(3);
  });

  it('eliminar la cuenta revoca el token en claro ANTES de borrar las filas', async () => {
    if (!ALLOW) return;

    const user = await prisma.user.findUniqueOrThrow({
      where: { appleSub: SUB },
    });
    let existiaAlRevocar: boolean | undefined;
    let tokenRevocado: string | undefined;
    const clienteRevocacion: IClienteAppleAuth = {
      intercambiarCodigo: vi.fn(),
      revocarRefreshToken: async (token) => {
        tokenRevocado = token;
        existiaAlRevocar =
          (await prisma.user.count({ where: { id: user.id } })) === 1;
        return Result.ok(undefined);
      },
    };

    const result = await eliminar(clienteRevocacion).execute({
      userId: user.id,
      confirmacion: 'ELIMINAR',
    });

    expect(result.isOk()).toBe(true);
    expect(tokenRevocado).toBe('rt-dos-SECRETO');
    expect(existiaAlRevocar).toBe(true);
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(0);
  });

  it('si Apple falla al revocar, la cuenta se elimina igual', async () => {
    if (!ALLOW) return;

    canje.mockResolvedValueOnce(Result.ok(canjeDe('rt-tres-SECRETO')));
    subEnCurso = `${SUB}-b`;
    const alta = await login.execute(
      { ...IDENTIDAD, sub: `${SUB}-b`, email: `b-${EMAIL}` },
      'Int Spec B',
      'code-b',
    );
    const userId = alta.getValue().userId;
    const clienteCaido: IClienteAppleAuth = {
      intercambiarCodigo: vi.fn(),
      revocarRefreshToken: async () =>
        Result.fail(new AppleAuthFallidoError('timeout')),
    };

    const result = await eliminar(clienteCaido).execute({
      userId,
      confirmacion: 'ELIMINAR',
    });

    expect(result.isOk()).toBe(true);
    expect(await prisma.user.count({ where: { id: userId } })).toBe(0);
  });
});

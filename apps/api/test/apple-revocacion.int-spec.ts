/**
 * apple-revocacion.int-spec.ts — Sign in with Apple, T4, contra Postgres REAL.
 *
 * El cliente de la API REST de Apple es un doble (nunca red real; su
 * contrato HTTP lo cubre `apple-auth-http.client.spec.ts`) y el id_token del
 * canje se verifica con un doble (su criptografía RSA/JWKS la cubre
 * `apple-id-token.adapter.spec.ts`). Todo lo demás es real: `LoginConAppleUseCase`,
 * repos Prisma, `AesGcmCryptoService`, `EliminarCuentaUseCase` y
 * `PrismaCuentaRepository`. Cada test crea su propio usuario (sub único) y
 * `afterEach` borra todo lo que se creó. Prueba:
 *  - el refresh token queda CIFRADO en `User.appleRefreshToken`, se sobrescribe
 *    en el siguiente login y un canje fallido no lo toca;
 *  - un code cuyo id_token es de OTRA identidad no se guarda y se revoca;
 *  - al eliminar la cuenta el revocador recibe el token en claro ANTES de que
 *    desaparezcan las filas, y la cuenta se elimina aunque Apple falle.
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
import { TareasSincronas } from './support/tareas-en-segundo-plano.double';

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';
const RUN_ID = `apple-revocacion-int-${Date.now()}`;
const canjeDe = (refreshToken: string) => ({ refreshToken, idToken: 'idt' });

describe('Apple refresh token (integration — real DB)', () => {
  let prisma: PrismaClient;
  let crypto: AesGcmCryptoService;
  let login: LoginConAppleUseCase;
  let tareas: TareasSincronas;
  let canje: Mock<IClienteAppleAuth['intercambiarCodigo']>;
  let revocarDescartado: Mock<IClienteAppleAuth['revocarRefreshToken']>;
  let subDelCanje: string;
  let contador = 0;
  const subsCreados: string[] = [];

  beforeAll(async () => {
    if (!ALLOW) return;

    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    const clave = Buffer.from(env.ENCRYPTION_KEY, 'base64');
    crypto = new AesGcmCryptoService(clave);
    canje = vi.fn<IClienteAppleAuth['intercambiarCodigo']>();
    revocarDescartado = vi
      .fn<IClienteAppleAuth['revocarRefreshToken']>()
      .mockResolvedValue(Result.ok(undefined));
    tareas = new TareasSincronas();
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
      { intercambiarCodigo: canje, revocarRefreshToken: revocarDescartado },
      new PrismaRefreshTokenAppleRepository(prisma, crypto),
      { verificarSubDelCanje: async () => Result.ok(subDelCanje) },
      tareas,
    );
  });

  afterEach(async () => {
    if (!ALLOW) return;
    const cuentas = new PrismaCuentaRepository(prisma);
    const users = await prisma.user.findMany({
      where: { appleSub: { in: subsCreados.splice(0) } },
      select: { id: true },
    });
    for (const { id } of users) {
      await cuentas.eliminar(id);
    }
  });

  afterAll(async () => {
    if (!ALLOW) return;
    await prisma.$disconnect();
  });

  /** Usuario Apple propio del test; `sub` único registrado para el cleanup. */
  async function nuevaIdentidad() {
    const n = ++contador;
    const sub = `sub-${RUN_ID}-${n}`;
    subsCreados.push(sub);
    subDelCanje = sub;
    return {
      sub,
      email: `${RUN_ID}-${n}@example.com`,
      emailVerificado: true,
      emailPrivado: false,
    };
  }

  async function ingresar(
    identidad: Awaited<ReturnType<typeof nuevaIdentidad>>,
    code?: string,
  ) {
    const result = await login.execute(identidad, 'Int Spec', code);
    await tareas.esperar();
    return result.getValue().userId;
  }

  const guardado = async (userId: string) =>
    (
      await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { appleRefreshToken: true },
      })
    ).appleRefreshToken;

  const eliminarCon = (cliente: IClienteAppleAuth) =>
    new EliminarCuentaUseCase(
      new PrismaCuentaRepository(prisma),
      new AppleRevocadorIdentidadExterna(
        new PrismaRefreshTokenAppleRepository(prisma, crypto),
        cliente,
        new NoOpLogger(),
      ),
      new NoOpLogger(),
    );

  it('login con code: guarda el refresh token CIFRADO; el siguiente login lo sobrescribe; un canje fallido no lo toca', async () => {
    if (!ALLOW) return;
    const identidad = await nuevaIdentidad();

    canje.mockResolvedValueOnce(Result.ok(canjeDe('rt-uno-SECRETO')));
    const userId = await ingresar(identidad, 'code-1');

    const cifrado = await guardado(userId);
    expect(cifrado).not.toBeNull();
    expect(cifrado).not.toContain('rt-uno');
    expect(crypto.decrypt(cifrado as string)).toBe('rt-uno-SECRETO');

    canje.mockResolvedValueOnce(Result.ok(canjeDe('rt-dos-SECRETO')));
    await ingresar(identidad, 'code-2');
    expect(crypto.decrypt((await guardado(userId)) as string)).toBe(
      'rt-dos-SECRETO',
    );

    canje.mockResolvedValueOnce(
      Result.fail(new AppleAuthFallidoError('invalid_grant')),
    );
    await ingresar(identidad, 'code-3');
    expect(crypto.decrypt((await guardado(userId)) as string)).toBe(
      'rt-dos-SECRETO',
    );

    const llamadas = canje.mock.calls.length;
    await ingresar(identidad);
    expect(canje).toHaveBeenCalledTimes(llamadas);
  });

  it('un code cuyo id_token es de OTRA identidad no se guarda y el token emitido se revoca', async () => {
    if (!ALLOW) return;
    const identidad = await nuevaIdentidad();
    subDelCanje = `${identidad.sub}-ajeno`;
    revocarDescartado.mockClear();

    canje.mockResolvedValueOnce(Result.ok(canjeDe('rt-ajeno-SECRETO')));
    const userId = await ingresar(identidad, 'code-ajeno');

    expect(await guardado(userId)).toBeNull();
    expect(revocarDescartado).toHaveBeenCalledWith('rt-ajeno-SECRETO');
  });

  it('eliminar la cuenta revoca el token en claro ANTES de borrar las filas', async () => {
    if (!ALLOW) return;
    const identidad = await nuevaIdentidad();
    canje.mockResolvedValueOnce(Result.ok(canjeDe('rt-tres-SECRETO')));
    const userId = await ingresar(identidad, 'code-1');

    let existiaAlRevocar: boolean | undefined;
    let tokenRevocado: string | undefined;
    const result = await eliminarCon({
      intercambiarCodigo: vi.fn(),
      revocarRefreshToken: async (token) => {
        tokenRevocado = token;
        existiaAlRevocar =
          (await prisma.user.count({ where: { id: userId } })) === 1;
        return Result.ok(undefined);
      },
    }).execute({ userId, confirmacion: 'ELIMINAR' });

    expect(result.isOk()).toBe(true);
    expect(tokenRevocado).toBe('rt-tres-SECRETO');
    expect(existiaAlRevocar).toBe(true);
    expect(await prisma.user.count({ where: { id: userId } })).toBe(0);
  });

  it('si Apple falla al revocar, la cuenta se elimina igual', async () => {
    if (!ALLOW) return;
    const identidad = await nuevaIdentidad();
    canje.mockResolvedValueOnce(Result.ok(canjeDe('rt-cuatro-SECRETO')));
    const userId = await ingresar(identidad, 'code-1');

    const result = await eliminarCon({
      intercambiarCodigo: vi.fn(),
      revocarRefreshToken: async () =>
        Result.fail(new AppleAuthFallidoError('timeout')),
    }).execute({ userId, confirmacion: 'ELIMINAR' });

    expect(result.isOk()).toBe(true);
    expect(await prisma.user.count({ where: { id: userId } })).toBe(0);
  });
});

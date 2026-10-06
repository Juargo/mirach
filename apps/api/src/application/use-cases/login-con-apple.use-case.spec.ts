import { LoginConAppleUseCase } from './login-con-apple.use-case';
import { IIdentidadAppleRepository } from '../ports/identidad-apple-repository.port';
import { IdentidadApple } from '../ports/verificador-identidad-apple.port';
import { ISessionRepository } from '../ports/session-repository.port';
import { ISessionTokenService } from '../ports/session-token.port';
import { ILogger } from '../ports/logger.port';
import { IClienteAppleAuth } from '../ports/cliente-apple-auth.port';
import { IRefreshTokenAppleRepository } from '../ports/refresh-token-apple-repository.port';
import { AppleAuthFallidoError } from '../../domain/errors/apple-auth-fallido.error';
import { Result } from '../../shared/result';
import { makeMockIdentidadAppleRepository as makeMockIdentidades } from '../../../test/support/identidad-apple-repository.double';
import { NoOpLogger, FakeLogger } from '../../../test/support/logger.double';

// Unit tests — LoginConAppleUseCase (puertos mockeados, reloj fijo). Sin infra.

const AHORA = new Date('2026-10-04T00:00:00.000Z');

const IDENTIDAD_BASE: IdentidadApple = {
  sub: 'apple-sub-abc',
  email: 'jorge@example.com',
  emailVerificado: true,
  emailPrivado: false,
};

function makeUseCase(
  identidades: IIdentidadAppleRepository,
  logger: ILogger = new NoOpLogger(),
) {
  const sessions: ISessionRepository = {
    crear: vi.fn().mockResolvedValue(undefined),
    buscarPorTokenHash: vi.fn(),
    revocarPorTokenHash: vi.fn(),
    revocarOtrasPorUserId: vi.fn(),
  };
  const tokens: ISessionTokenService = {
    generar: vi
      .fn()
      .mockReturnValue({ token: 'raw-token-apple', tokenHash: 'hash-apple' }),
    hashToken: vi.fn(),
  };
  const uc = new LoginConAppleUseCase(
    identidades,
    sessions,
    tokens,
    { ahora: () => AHORA },
    logger,
  );
  return { uc, sessions };
}

describe('LoginConAppleUseCase', () => {
  describe('appleSub ya conocido', () => {
    it('emite sesión, esNuevoUsuario false, y no mira el email ni el nombre', async () => {
      const identidades = makeMockIdentidades({
        porAppleSub: { userId: 'user-1', appleSub: 'apple-sub-abc' },
      });
      const { uc, sessions } = makeUseCase(identidades);

      const result = await uc.execute(IDENTIDAD_BASE, 'Otro Nombre');

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual({
        token: 'raw-token-apple',
        userId: 'user-1',
        expiresAt: new Date('2026-10-11T00:00:00.000Z'),
        esNuevoUsuario: false,
      });
      expect(sessions.crear).toHaveBeenCalledWith({
        userId: 'user-1',
        tokenHash: 'hash-apple',
        expiresAt: new Date('2026-10-11T00:00:00.000Z'),
      });
      expect(identidades.buscarPorEmail).not.toHaveBeenCalled();
      expect(identidades.crearDesdeApple).not.toHaveBeenCalled();
    });

    it('funciona aunque el token ya no traiga email (logins posteriores al primero)', async () => {
      const identidades = makeMockIdentidades({
        porAppleSub: { userId: 'user-1', appleSub: 'apple-sub-abc' },
      });
      const { uc } = makeUseCase(identidades);

      const result = await uc.execute({
        ...IDENTIDAD_BASE,
        email: null,
        emailVerificado: false,
      });

      expect(result.isOk()).toBe(true);
    });
  });

  describe('enlace por email (email real, verificado)', () => {
    it('enlaza el appleSub a la cuenta existente y emite sesión', async () => {
      const identidades = makeMockIdentidades({
        porEmail: { userId: 'user-2', appleSub: null },
      });
      const { uc } = makeUseCase(identidades);

      const result = await uc.execute(IDENTIDAD_BASE);

      expect(result.getValue().userId).toBe('user-2');
      expect(result.getValue().esNuevoUsuario).toBe(false);
      expect(identidades.vincularAppleSub).toHaveBeenCalledWith(
        'user-2',
        'apple-sub-abc',
      );
      expect(identidades.crearDesdeApple).not.toHaveBeenCalled();
    });

    it('guarda anti-takeover: la fila ya tiene OTRO appleSub → falla sin re-enlazar', async () => {
      const identidades = makeMockIdentidades({
        porEmail: { userId: 'user-3', appleSub: 'otro-apple-sub' },
      });
      const { uc, sessions } = makeUseCase(identidades);

      const result = await uc.execute(IDENTIDAD_BASE);

      expect(result.isFail()).toBe(true);
      expect(result.getError().motivo).toBe('ya-vinculado-a-otra-identidad');
      expect(identidades.vincularAppleSub).not.toHaveBeenCalled();
      expect(sessions.crear).not.toHaveBeenCalled();
    });

    it('perder la carrera del enlace → falla', async () => {
      const identidades = makeMockIdentidades({
        porEmail: { userId: 'user-2', appleSub: null },
        vincular: false,
      });
      const { uc, sessions } = makeUseCase(identidades);

      const result = await uc.execute(IDENTIDAD_BASE);

      expect(result.getError().motivo).toBe('link-perdio-la-carrera');
      expect(sessions.crear).not.toHaveBeenCalled();
    });
  });

  describe('email relay privado', () => {
    const RELAY: IdentidadApple = {
      sub: 'apple-sub-relay',
      email: 'abc123@privaterelay.appleid.com',
      emailVerificado: true,
      emailPrivado: true,
    };

    it('NO busca ni enlaza por email: crea una cuenta nueva', async () => {
      const identidades = makeMockIdentidades({
        // Aunque existiera una fila con ese email, un relay no prueba titularidad.
        porEmail: { userId: 'user-existente', appleSub: null },
      });
      const { uc } = makeUseCase(identidades);

      const result = await uc.execute(RELAY, 'Ana Pérez');

      expect(result.getValue().esNuevoUsuario).toBe(true);
      expect(identidades.buscarPorEmail).not.toHaveBeenCalled();
      expect(identidades.vincularAppleSub).not.toHaveBeenCalled();
      expect(identidades.crearDesdeApple).toHaveBeenCalledWith(
        expect.objectContaining({ appleSub: 'apple-sub-relay' }),
      );
    });

    it('sin nombre usa "Usuario" (la parte local del relay es ruido)', async () => {
      const identidades = makeMockIdentidades();
      const { uc } = makeUseCase(identidades);

      await uc.execute(RELAY);

      expect(identidades.crearDesdeApple).toHaveBeenCalledWith(
        expect.objectContaining({ nombre: 'Usuario' }),
      );
    });
  });

  describe('cuenta nueva', () => {
    it('con nombre de la primera autorización: lo usa (recortado)', async () => {
      const identidades = makeMockIdentidades({ crear: 'user-nuevo' });
      const { uc, sessions } = makeUseCase(identidades);

      const result = await uc.execute(IDENTIDAD_BASE, '  Jorge Retamal  ');

      expect(result.getValue()).toMatchObject({
        userId: 'user-nuevo',
        esNuevoUsuario: true,
      });
      expect(identidades.crearDesdeApple).toHaveBeenCalledWith({
        email: expect.objectContaining({ valor: 'jorge@example.com' }),
        appleSub: 'apple-sub-abc',
        nombre: 'Jorge Retamal',
      });
      expect(sessions.crear).toHaveBeenCalledTimes(1);
    });

    it.each([undefined, null, '', '   '])(
      'sin nombre (%j): usa la parte local del email',
      async (nombre) => {
        const identidades = makeMockIdentidades();
        const { uc } = makeUseCase(identidades);

        await uc.execute(IDENTIDAD_BASE, nombre);

        expect(identidades.crearDesdeApple).toHaveBeenCalledWith(
          expect.objectContaining({ nombre: 'jorge' }),
        );
      },
    );

    it('un nombre de más de 80 caracteres se trunca a 80', async () => {
      const identidades = makeMockIdentidades();
      const { uc } = makeUseCase(identidades);

      await uc.execute(IDENTIDAD_BASE, 'a'.repeat(200));

      expect(identidades.crearDesdeApple).toHaveBeenCalledWith(
        expect.objectContaining({ nombre: 'a'.repeat(80) }),
      );
    });

    it('sin email → falla cerrado con motivo email-ausente, sin crear nada', async () => {
      const identidades = makeMockIdentidades();
      const logger = new FakeLogger();
      const { uc, sessions } = makeUseCase(identidades, logger);

      const result = await uc.execute({ ...IDENTIDAD_BASE, email: null });

      expect(result.isFail()).toBe(true);
      expect(result.getError().motivo).toBe('email-ausente');
      expect(identidades.crearDesdeApple).not.toHaveBeenCalled();
      expect(sessions.crear).not.toHaveBeenCalled();
    });

    it('email sin verificar → falla', async () => {
      const { uc } = makeUseCase(makeMockIdentidades());

      const result = await uc.execute({
        ...IDENTIDAD_BASE,
        emailVerificado: false,
      });

      expect(result.getError().motivo).toBe('email-no-verificado');
    });

    it('email malformado → falla', async () => {
      const { uc } = makeUseCase(makeMockIdentidades());

      const result = await uc.execute({
        ...IDENTIDAD_BASE,
        email: 'no-es-email',
      });

      expect(result.getError().motivo).toBe('email-invalido');
    });

    it('perder la carrera pero ganarla el mismo sub (doble submit) → sesión, esNuevoUsuario true', async () => {
      const identidades = makeMockIdentidades({
        porAppleSubSecuencia: [
          null,
          { userId: 'user-ganador', appleSub: 'apple-sub-abc' },
        ],
        crear: null,
      });
      const { uc } = makeUseCase(identidades);

      const result = await uc.execute(IDENTIDAD_BASE);

      expect(result.getValue()).toMatchObject({
        userId: 'user-ganador',
        esNuevoUsuario: true,
      });
    });

    it('perder la carrera ante OTRA identidad → falla', async () => {
      const identidades = makeMockIdentidades({ crear: null });
      const { uc, sessions } = makeUseCase(identidades);

      const result = await uc.execute(IDENTIDAD_BASE);

      expect(result.getError().motivo).toBe('creacion-perdio-la-carrera');
      expect(sessions.crear).not.toHaveBeenCalled();
    });
  });

  describe('carrera de alta concurrente que colisiona en el índice de email', () => {
    it('el ganador commitea entre el lookup por sub y el de email (misma identidad) → sesión sobre esa fila, sin ya-vinculado', async () => {
      const identidades = makeMockIdentidades({
        porEmail: { userId: 'user-ganador', appleSub: 'apple-sub-abc' },
      });
      const { uc } = makeUseCase(identidades);

      const result = await uc.execute(IDENTIDAD_BASE);

      expect(result.getValue()).toMatchObject({
        userId: 'user-ganador',
        esNuevoUsuario: false,
      });
      expect(identidades.vincularAppleSub).not.toHaveBeenCalled();
      expect(identidades.crearDesdeApple).not.toHaveBeenCalled();
    });

    it('perder el alta (P2002) y el ganador solo aparece por email con el mismo sub → sesión, esNuevoUsuario true', async () => {
      const identidades = makeMockIdentidades({
        crear: null,
        porEmailSecuencia: [
          null,
          { userId: 'user-ganador', appleSub: 'apple-sub-abc' },
        ],
      });
      const { uc } = makeUseCase(identidades);

      const result = await uc.execute(IDENTIDAD_BASE);

      expect(result.getValue()).toMatchObject({
        userId: 'user-ganador',
        esNuevoUsuario: true,
      });
    });

    it('perder el alta ante una cuenta sin appleSub que ocupó el email → se enlaza con la guarda normal y emite sesión', async () => {
      const identidades = makeMockIdentidades({
        crear: null,
        porEmailSecuencia: [null, { userId: 'user-previo', appleSub: null }],
      });
      const { uc } = makeUseCase(identidades);

      const result = await uc.execute(IDENTIDAD_BASE);

      expect(result.getValue()).toMatchObject({
        userId: 'user-previo',
        esNuevoUsuario: true,
      });
      expect(identidades.vincularAppleSub).toHaveBeenCalledWith(
        'user-previo',
        'apple-sub-abc',
      );
    });

    it('perder el alta ante una cuenta con OTRO appleSub → falla sin enlazar (anti-takeover)', async () => {
      const identidades = makeMockIdentidades({
        crear: null,
        porEmailSecuencia: [
          null,
          { userId: 'user-ajeno', appleSub: 'otro-apple-sub' },
        ],
      });
      const { uc, sessions } = makeUseCase(identidades);

      const result = await uc.execute(IDENTIDAD_BASE);

      expect(result.getError().motivo).toBe('ya-vinculado-a-otra-identidad');
      expect(identidades.vincularAppleSub).not.toHaveBeenCalled();
      expect(sessions.crear).not.toHaveBeenCalled();
    });

    it('perder el alta con relay privado: nunca se busca ni enlaza por email', async () => {
      const identidades = makeMockIdentidades({
        crear: null,
        porEmail: { userId: 'user-ajeno', appleSub: null },
      });
      const { uc, sessions } = makeUseCase(identidades);

      const result = await uc.execute({
        sub: 'apple-sub-relay',
        email: 'abc123@privaterelay.appleid.com',
        emailVerificado: true,
        emailPrivado: true,
      });

      expect(result.getError().motivo).toBe('creacion-perdio-la-carrera');
      expect(identidades.buscarPorEmail).not.toHaveBeenCalled();
      expect(identidades.vincularAppleSub).not.toHaveBeenCalled();
      expect(sessions.crear).not.toHaveBeenCalled();
    });
  });

  it('ningún log contiene el sub, el email, el nombre ni el token (ADR-013)', async () => {
    const logger = new FakeLogger();
    const identidades = makeMockIdentidades();
    const { uc } = makeUseCase(identidades, logger);

    await uc.execute(IDENTIDAD_BASE, 'Jorge Secreto');

    const volcado = JSON.stringify(logger.calls);
    for (const secreto of [
      'apple-sub-abc',
      'jorge@example.com',
      'Jorge Secreto',
      'raw-token-apple',
    ]) {
      expect(volcado).not.toContain(secreto);
    }
  });
});

describe('LoginConAppleUseCase — authorizationCode (refresh token de Apple, T4)', () => {
  const CODE = 'c-5min-SECRETO';
  const REFRESH = 'rt-apple-SECRETO';

  function makeConCanje(opts?: {
    canje?: Result<string, AppleAuthFallidoError>;
    canjeLanza?: boolean;
    guardarLanza?: boolean;
    sinCliente?: boolean;
    porAppleSub?: { userId: string; appleSub: string } | null;
  }) {
    const cliente: IClienteAppleAuth = {
      intercambiarCodigo: opts?.canjeLanza
        ? vi.fn().mockRejectedValue(new TypeError('boom'))
        : vi.fn().mockResolvedValue(opts?.canje ?? Result.ok(REFRESH)),
      revocarRefreshToken: vi.fn(),
    };
    const refreshTokens: IRefreshTokenAppleRepository = {
      guardar: opts?.guardarLanza
        ? vi.fn().mockRejectedValue(new RangeError('db caída'))
        : vi.fn().mockResolvedValue(undefined),
      obtener: vi.fn(),
    };
    const identidades = makeMockIdentidades({
      porAppleSub:
        opts?.porAppleSub === undefined
          ? { userId: 'user-1', appleSub: 'apple-sub-abc' }
          : opts.porAppleSub,
    });
    const logger = new FakeLogger();
    const sessions: ISessionRepository = {
      crear: vi.fn().mockResolvedValue(undefined),
      buscarPorTokenHash: vi.fn(),
      revocarPorTokenHash: vi.fn(),
      revocarOtrasPorUserId: vi.fn(),
    };
    const tokens: ISessionTokenService = {
      generar: vi.fn().mockReturnValue({ token: 't', tokenHash: 'h' }),
      hashToken: vi.fn(),
    };
    const uc = new LoginConAppleUseCase(
      identidades,
      sessions,
      tokens,
      { ahora: () => AHORA },
      logger,
      opts?.sinCliente ? undefined : cliente,
      opts?.sinCliente ? undefined : refreshTokens,
    );
    return { uc, cliente, refreshTokens, logger, sessions };
  }

  it('con code: canjea tras verificar la identidad y guarda el refresh token del usuario', async () => {
    const { uc, cliente, refreshTokens } = makeConCanje();

    const result = await uc.execute(IDENTIDAD_BASE, null, CODE);

    expect(result.isOk()).toBe(true);
    expect(cliente.intercambiarCodigo).toHaveBeenCalledWith(CODE);
    expect(refreshTokens.guardar).toHaveBeenCalledWith('user-1', REFRESH);
  });

  it('con code en un alta: guarda para el userId recién creado', async () => {
    const { uc, refreshTokens } = makeConCanje({ porAppleSub: null });

    const result = await uc.execute(IDENTIDAD_BASE, 'Jorge', CODE);

    expect(result.getValue().userId).toBe('user-nuevo');
    expect(refreshTokens.guardar).toHaveBeenCalledWith('user-nuevo', REFRESH);
  });

  it.each([undefined, null, '', '   '])(
    'sin code (%j): no canjea y el login es idéntico al de antes',
    async (code) => {
      const { uc, cliente, refreshTokens } = makeConCanje();

      const result = await uc.execute(IDENTIDAD_BASE, null, code);

      expect(result.isOk()).toBe(true);
      expect(cliente.intercambiarCodigo).not.toHaveBeenCalled();
      expect(refreshTokens.guardar).not.toHaveBeenCalled();
    },
  );

  it('si el login falla no se canjea el code (no se gasta un código de un solo uso)', async () => {
    const { uc, cliente } = makeConCanje({ porAppleSub: null });

    const result = await uc.execute(
      { ...IDENTIDAD_BASE, emailVerificado: false },
      null,
      CODE,
    );

    expect(result.isFail()).toBe(true);
    expect(cliente.intercambiarCodigo).not.toHaveBeenCalled();
  });

  it('canje fallido (invalid_grant): el login SIGUE OK, nada se guarda y se avisa con motivo atribuible', async () => {
    const { uc, refreshTokens, logger } = makeConCanje({
      canje: Result.fail(new AppleAuthFallidoError('invalid_grant')),
    });

    const result = await uc.execute(IDENTIDAD_BASE, null, CODE);

    expect(result.isOk()).toBe(true);
    expect(refreshTokens.guardar).not.toHaveBeenCalled();
    const warn = logger.calls.find((c) => c.level === 'warn');
    expect(warn?.message).toContain('canje');
    expect(warn?.context).toEqual({
      userId: 'user-1',
      motivo: 'invalid_grant',
    });
  });

  it('el detalle saneado de Apple (p. ej. invalid_client) viaja en el warn', async () => {
    const { uc, logger } = makeConCanje({
      canje: Result.fail(
        new AppleAuthFallidoError('rechazado', 'invalid_client'),
      ),
    });

    await uc.execute(IDENTIDAD_BASE, null, CODE);

    expect(logger.calls.find((c) => c.level === 'warn')?.context).toEqual({
      userId: 'user-1',
      motivo: 'rechazado',
      detalle: 'invalid_client',
    });
  });

  it('canje que lanza: el login SIGUE OK y el warn lleva solo el nombre del error', async () => {
    const { uc, logger } = makeConCanje({ canjeLanza: true });

    const result = await uc.execute(IDENTIDAD_BASE, null, CODE);

    expect(result.isOk()).toBe(true);
    expect(logger.calls.find((c) => c.level === 'warn')?.context).toEqual({
      userId: 'user-1',
      errorName: 'TypeError',
    });
  });

  it('guardado que lanza: el login SIGUE OK y se avisa', async () => {
    const { uc, logger } = makeConCanje({ guardarLanza: true });

    const result = await uc.execute(IDENTIDAD_BASE, null, CODE);

    expect(result.isOk()).toBe(true);
    expect(logger.calls.find((c) => c.level === 'warn')?.context).toEqual({
      userId: 'user-1',
      errorName: 'RangeError',
    });
  });

  it('intercambio no configurado (sin credenciales de Apple): ignora el code sin llamar a nadie', async () => {
    const { uc, logger } = makeConCanje({ sinCliente: true });

    const result = await uc.execute(IDENTIDAD_BASE, null, CODE);

    expect(result.isOk()).toBe(true);
    expect(logger.calls.some((c) => c.level === 'warn')).toBe(false);
  });

  it('nunca loguea el code ni el refresh token', async () => {
    for (const opts of [
      undefined,
      { canje: Result.fail(new AppleAuthFallidoError('invalid_grant')) },
      { canjeLanza: true },
      { guardarLanza: true },
    ]) {
      const { uc, logger } = makeConCanje(opts);

      await uc.execute(IDENTIDAD_BASE, null, CODE);

      const volcado = JSON.stringify(logger.calls);
      expect(volcado).not.toContain('SECRETO');
    }
  });
});

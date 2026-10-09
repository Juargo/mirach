import { AppleRevocadorIdentidadExterna } from './apple-revocador-identidad-externa';
import type { IClienteAppleAuth } from '../../application/ports/cliente-apple-auth.port';
import type { IRefreshTokenAppleRepository } from '../../application/ports/refresh-token-apple-repository.port';
import { AppleAuthFallidoError } from '../../domain/errors/apple-auth-fallido.error';
import { Result } from '../../shared/result';
import { FakeLogger } from '../../../test/support/logger.double';

function build(opts: {
  token?: string | null;
  revoca?: Result<void, AppleAuthFallidoError>;
  obtenerLanza?: boolean;
}) {
  const refreshTokens: IRefreshTokenAppleRepository = {
    guardar: vi.fn(),
    obtener: opts.obtenerLanza
      ? vi.fn().mockRejectedValue(new Error('descifrado falló'))
      : vi
          .fn()
          .mockResolvedValue(opts.token === undefined ? 'rt-1' : opts.token),
  };
  const cliente: IClienteAppleAuth = {
    intercambiarCodigo: vi.fn(),
    revocarRefreshToken: vi
      .fn()
      .mockResolvedValue(opts.revoca ?? Result.ok(undefined)),
  };
  const logger = new FakeLogger();
  return {
    revocador: new AppleRevocadorIdentidadExterna(
      refreshTokens,
      cliente,
      logger,
    ),
    refreshTokens,
    cliente,
    logger,
  };
}

describe('AppleRevocadorIdentidadExterna', () => {
  it('con token guardado: lo revoca en Apple (en claro) y deja un info atribuible', async () => {
    const { revocador, refreshTokens, cliente, logger } = build({});

    await revocador.revocar('u1');

    expect(refreshTokens.obtener).toHaveBeenCalledWith('u1');
    expect(cliente.revocarRefreshToken).toHaveBeenCalledWith('rt-1');
    expect(logger.calls).toHaveLength(1);
    expect(logger.calls[0]).toMatchObject({
      level: 'info',
      context: { userId: 'u1' },
    });
  });

  it('sin token guardado: no llama a Apple y deja un info', async () => {
    const { revocador, cliente, logger } = build({ token: null });

    await revocador.revocar('u1');

    expect(cliente.revocarRefreshToken).not.toHaveBeenCalled();
    expect(logger.calls.map((c) => c.level)).toEqual(['info']);
  });

  it.each([
    ['timeout', new AppleAuthFallidoError('timeout')],
    ['red', new AppleAuthFallidoError('red')],
    ['rechazado', new AppleAuthFallidoError('rechazado', 'invalid_client')],
  ])(
    'fallo de Apple (%s): NO lanza, avisa con userId y motivo',
    async (_n, error) => {
      const { revocador, logger } = build({ revoca: Result.fail(error) });

      await expect(revocador.revocar('u1')).resolves.toBeUndefined();

      const warn = logger.calls.find((c) => c.level === 'warn');
      expect(warn?.context).toMatchObject({
        userId: 'u1',
        motivo: error.motivo,
      });
    },
  );

  it('nunca loguea el refresh token', async () => {
    for (const revoca of [
      undefined,
      Result.fail(new AppleAuthFallidoError('red')) as Result<
        void,
        AppleAuthFallidoError
      >,
    ]) {
      const { revocador, logger } = build({ token: 'rt-SECRETO', revoca });

      await revocador.revocar('u1');

      expect(JSON.stringify(logger.calls)).not.toContain('SECRETO');
    }
  });

  it('si no se puede leer/descifrar el token, la excepción sube (el use case la captura y avisa)', async () => {
    const { revocador } = build({ obtenerLanza: true });

    await expect(revocador.revocar('u1')).rejects.toThrow('descifrado falló');
  });
});

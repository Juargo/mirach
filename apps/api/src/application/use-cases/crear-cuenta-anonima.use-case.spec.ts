import { CrearCuentaAnonimaUseCase } from './crear-cuenta-anonima.use-case';
import { ICuentaAnonimaRepository } from '../ports/cuenta-anonima-repository.port';
import { ISessionRepository } from '../ports/session-repository.port';
import { AltaAnonimaFallidaError } from '../../domain/errors/alta-anonima-fallida.error';
import { NoOpLogger } from '../../../test/support/logger.double';

const AHORA = new Date('2026-11-12T00:00:00.000Z');

function armar(exigirTerminos = false) {
  const cuentas: ICuentaAnonimaRepository = {
    crear: vi.fn().mockResolvedValue('anon-1'),
    esAnonima: vi.fn(),
    existeIdentidad: vi.fn(),
    existeEmailEnOtraCuenta: vi.fn(),
    vincular: vi.fn(),
  };
  const sessions: ISessionRepository = {
    crear: vi.fn().mockResolvedValue(undefined),
    buscarPorTokenHash: vi.fn(),
    revocarPorTokenHash: vi.fn(),
    revocarOtrasPorUserId: vi.fn(),
  };
  const uc = new CrearCuentaAnonimaUseCase(
    cuentas,
    sessions,
    {
      generar: vi.fn().mockReturnValue({ token: 'raw', tokenHash: 'hash' }),
      hashToken: vi.fn(),
    },
    { ahora: () => AHORA },
    new NoOpLogger(),
    exigirTerminos,
  );
  return { uc, cuentas, sessions };
}

describe('CrearCuentaAnonimaUseCase', () => {
  it('creates the account with the accepted terms and issues a 365-day session', async () => {
    const { uc, cuentas, sessions } = armar();

    const result = await uc.execute({ terminos: '1.0', privacidad: '1.1' });

    expect(result.getValue()).toEqual({
      token: 'raw',
      userId: 'anon-1',
      expiresAt: new Date('2027-11-12T00:00:00.000Z'),
    });
    const aceptacion = vi.mocked(cuentas.crear).mock.calls[0][0];
    expect(aceptacion?.terminos.valor).toBe('1.0');
    expect(aceptacion?.privacidad.valor).toBe('1.1');
    expect(sessions.crear).toHaveBeenCalledWith({
      userId: 'anon-1',
      tokenHash: 'hash',
      expiresAt: new Date('2027-11-12T00:00:00.000Z'),
    });
  });

  it('creates the account without terms while they are not required', async () => {
    const { uc, cuentas } = armar(false);

    const result = await uc.execute({});

    expect(result.isOk()).toBe(true);
    expect(cuentas.crear).toHaveBeenCalledWith(null);
  });

  it('does not create the account without terms when they are required', async () => {
    const { uc, cuentas, sessions } = armar(true);

    const result = await uc.execute({});

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(AltaAnonimaFallidaError);
    expect(cuentas.crear).not.toHaveBeenCalled();
    expect(sessions.crear).not.toHaveBeenCalled();
  });

  it('rejects one version without the other', async () => {
    const { uc, cuentas } = armar();

    const result = await uc.execute({ terminos: '1.0' });

    expect(result.isFail()).toBe(true);
    expect(cuentas.crear).not.toHaveBeenCalled();
  });
});

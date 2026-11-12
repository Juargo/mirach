import {
  IdentidadAVincular,
  VincularIdentidadUseCase,
} from './vincular-identidad.use-case';
import { ICuentaAnonimaRepository } from '../ports/cuenta-anonima-repository.port';
import { ISessionRepository } from '../ports/session-repository.port';
import { VinculacionFallidaError } from '../../domain/errors/vinculacion-fallida.error';
import { NoOpLogger } from '../../../test/support/logger.double';

const AHORA = new Date('2026-11-12T00:00:00.000Z');

const IDENTIDAD: IdentidadAVincular = {
  proveedor: 'apple',
  sub: 'apple-sub-1',
  email: 'persona@example.com',
  emailVerificado: true,
  emailPrivado: false,
};

function armar(over: Partial<ICuentaAnonimaRepository> = {}) {
  const cuentas: ICuentaAnonimaRepository = {
    crear: vi.fn(),
    esAnonima: vi.fn().mockResolvedValue(true),
    existeIdentidad: vi.fn().mockResolvedValue(false),
    existeEmailEnOtraCuenta: vi.fn().mockResolvedValue(false),
    vincular: vi.fn().mockResolvedValue(true),
    ...over,
  };
  const sessions: ISessionRepository = {
    crear: vi.fn().mockResolvedValue(undefined),
    buscarPorTokenHash: vi.fn(),
    revocarPorTokenHash: vi.fn().mockResolvedValue(undefined),
    revocarOtrasPorUserId: vi.fn(),
  };
  const uc = new VincularIdentidadUseCase(
    cuentas,
    sessions,
    {
      generar: vi.fn().mockReturnValue({ token: 'raw', tokenHash: 'hash' }),
      hashToken: vi.fn(),
    },
    { ahora: () => AHORA },
    new NoOpLogger(),
  );
  const ejecutar = (identidad = IDENTIDAD, nombre: string | null = null) =>
    uc.execute({
      userId: 'anon-1',
      tokenHashActual: 'hash-anonimo',
      identidad,
      nombre,
    });
  return { cuentas, sessions, ejecutar };
}

function motivo(result: { getError(): VinculacionFallidaError }) {
  return result.getError().motivo;
}

describe('VincularIdentidadUseCase', () => {
  it('links a new identity, revokes the anonymous session and issues an ordinary 7-day one', async () => {
    const { cuentas, sessions, ejecutar } = armar();

    const result = await ejecutar(IDENTIDAD, '  Jorge  ');

    expect(result.getValue()).toEqual({
      token: 'raw',
      userId: 'anon-1',
      expiresAt: new Date('2026-11-19T00:00:00.000Z'),
    });
    const input = vi.mocked(cuentas.vincular).mock.calls[0][0];
    expect(input).toMatchObject({
      userId: 'anon-1',
      proveedor: 'apple',
      sub: 'apple-sub-1',
      nombre: 'Jorge',
    });
    expect(input.email?.valor).toBe('persona@example.com');
    expect(sessions.crear).toHaveBeenCalledWith({
      userId: 'anon-1',
      tokenHash: 'hash',
      expiresAt: new Date('2026-11-19T00:00:00.000Z'),
    });
    expect(sessions.revocarPorTokenHash).toHaveBeenCalledWith('hash-anonimo');
  });

  it('rejects a caller that is not anonymous and writes nothing', async () => {
    const { cuentas, sessions, ejecutar } = armar({
      esAnonima: vi.fn().mockResolvedValue(false),
    });

    const result = await ejecutar();

    expect(motivo(result)).toBe('cuenta-no-anonima');
    expect(cuentas.vincular).not.toHaveBeenCalled();
    expect(sessions.crear).not.toHaveBeenCalled();
    expect(sessions.revocarPorTokenHash).not.toHaveBeenCalled();
  });

  it('rejects an identity that already owns an account and writes nothing', async () => {
    const { cuentas, sessions, ejecutar } = armar({
      existeIdentidad: vi.fn().mockResolvedValue(true),
    });

    const result = await ejecutar();

    expect(motivo(result)).toBe('cuenta-ya-existe');
    expect(cuentas.existeIdentidad).toHaveBeenCalledWith(
      'apple',
      'apple-sub-1',
    );
    expect(cuentas.vincular).not.toHaveBeenCalled();
    expect(sessions.crear).not.toHaveBeenCalled();
    expect(sessions.revocarPorTokenHash).not.toHaveBeenCalled();
  });

  it('rejects a verified real email that already belongs to an account', async () => {
    const { cuentas, ejecutar } = armar({
      existeEmailEnOtraCuenta: vi.fn().mockResolvedValue(true),
    });

    const result = await ejecutar();

    expect(motivo(result)).toBe('cuenta-ya-existe');
    expect(cuentas.vincular).not.toHaveBeenCalled();
    const [email, exceptoUserId] = vi.mocked(cuentas.existeEmailEnOtraCuenta)
      .mock.calls[0];
    expect(email.valor).toBe('persona@example.com');
    expect(exceptoUserId).toBe('anon-1');
  });

  it('never matches an existing account through an Apple private relay email', async () => {
    const { cuentas, ejecutar } = armar({
      existeEmailEnOtraCuenta: vi.fn().mockResolvedValue(true),
    });

    const result = await ejecutar({ ...IDENTIDAD, emailPrivado: true });

    expect(result.isOk()).toBe(true);
    expect(cuentas.existeEmailEnOtraCuenta).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', { email: null }],
    ['unverified', { emailVerificado: false }],
    ['malformed', { email: 'no-es-un-email' }],
  ])('links by sub alone when the email is %s', async (_caso, cambio) => {
    const { cuentas, ejecutar } = armar();

    const result = await ejecutar({ ...IDENTIDAD, ...cambio });

    expect(result.isOk()).toBe(true);
    expect(vi.mocked(cuentas.vincular).mock.calls[0][0].email).toBeNull();
    expect(cuentas.existeEmailEnOtraCuenta).not.toHaveBeenCalled();
  });

  it('reports an existing account when the write loses a race, keeping the anonymous session', async () => {
    const { sessions, ejecutar } = armar({
      vincular: vi.fn().mockResolvedValue(false),
    });

    const result = await ejecutar();

    expect(motivo(result)).toBe('cuenta-ya-existe');
    expect(sessions.crear).not.toHaveBeenCalled();
    expect(sessions.revocarPorTokenHash).not.toHaveBeenCalled();
  });

  it('passes a blank name as null and caps a long one at 80 characters', async () => {
    const { cuentas, ejecutar } = armar();

    await ejecutar(IDENTIDAD, '   ');
    await ejecutar(IDENTIDAD, 'x'.repeat(200));

    expect(vi.mocked(cuentas.vincular).mock.calls[0][0].nombre).toBeNull();
    expect(vi.mocked(cuentas.vincular).mock.calls[1][0].nombre).toHaveLength(
      80,
    );
  });
});

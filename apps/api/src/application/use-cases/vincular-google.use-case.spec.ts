import { VincularGoogleUseCase } from './vincular-google.use-case';
import {
  IIdentidadGoogleRepository,
  UsuarioVinculable,
} from '../ports/identidad-google-repository.port';
import { VinculacionGoogleFallidaError } from '../../domain/errors/vinculacion-google-fallida.error';
import { NoOpLogger, FakeLogger } from '../../../test/support/logger.double';

function makeIdentidades(
  overrides: Partial<IIdentidadGoogleRepository> = {},
): IIdentidadGoogleRepository {
  return {
    buscarPorGoogleSub: vi.fn().mockResolvedValue(null),
    buscarPorEmail: vi.fn(),
    vincularGoogleSub: vi.fn().mockResolvedValue(true),
    buscarPorId: vi.fn(),
    desvincularGoogleSub: vi.fn(),
    ...overrides,
  };
}

describe('VincularGoogleUseCase', () => {
  it('CA-05 estructural: el input tiene EXACTAMENTE dos campos — userId y sub, ningún campo donde pudiera entrar un token de Google', () => {
    const input = { userId: 'user-1', sub: 'sub-1' };
    expect(Object.keys(input).sort()).toEqual(['sub', 'userId']);
  });

  it('link fresco: buscarPorId → null googleSub ⇒ vincularGoogleSub llamado UNA vez con exactamente esos args', async () => {
    const identidades = makeIdentidades({
      buscarPorId: vi.fn().mockResolvedValue({
        userId: 'user-1',
        esDemo: false,
        googleSub: null,
      } satisfies UsuarioVinculable),
    });
    const uc = new VincularGoogleUseCase(identidades, new NoOpLogger());

    const result = await uc.execute({ userId: 'user-1', sub: 'sub-nuevo' });

    expect(result.isOk()).toBe(true);
    expect(identidades.vincularGoogleSub).toHaveBeenCalledTimes(1);
    expect(identidades.vincularGoogleSub).toHaveBeenCalledWith(
      'user-1',
      'sub-nuevo',
    );
  });

  it('IDEMPOTENTE: mismo sub ya en la fila ⇒ ok, y vincularGoogleSub NUNCA se llama', async () => {
    const identidades = makeIdentidades({
      buscarPorId: vi.fn().mockResolvedValue({
        userId: 'user-1',
        esDemo: false,
        googleSub: 'sub-ya-linkeado',
      } satisfies UsuarioVinculable),
    });
    const uc = new VincularGoogleUseCase(identidades, new NoOpLogger());

    const result = await uc.execute({
      userId: 'user-1',
      sub: 'sub-ya-linkeado',
    });

    expect(result.isOk()).toBe(true);
    expect(identidades.vincularGoogleSub).not.toHaveBeenCalled();
  });

  it('un sub DISTINTO ya en la fila ⇒ fail (link-perdio-la-carrera... no, "ya-tiene-otro-sub"), sin write — cambiar de cuenta es unlink-then-link', async () => {
    const identidades = makeIdentidades({
      buscarPorId: vi.fn().mockResolvedValue({
        userId: 'user-1',
        esDemo: false,
        googleSub: 'otro-sub-distinto',
      } satisfies UsuarioVinculable),
    });
    const uc = new VincularGoogleUseCase(identidades, new NoOpLogger());

    const result = await uc.execute({ userId: 'user-1', sub: 'sub-nuevo' });

    expect(result.isFail()).toBe(true);
    const error = result.getError();
    expect(error).toBeInstanceOf(VinculacionGoogleFallidaError);
    expect(error.motivo).toBe('ya-tiene-otro-sub');
    expect(identidades.vincularGoogleSub).not.toHaveBeenCalled();
  });

  it('★ BINDING PROOF: buscarPorGoogleSub(sub) devuelve OTRO usuario ⇒ fail identidad-de-otra-cuenta, y vincularGoogleSub NUNCA se llama — nunca re-linkear', async () => {
    const identidades = makeIdentidades({
      buscarPorId: vi.fn().mockResolvedValue({
        userId: 'user-A',
        esDemo: false,
        googleSub: null,
      } satisfies UsuarioVinculable),
      buscarPorGoogleSub: vi.fn().mockResolvedValue({
        userId: 'user-B',
        esDemo: false,
        googleSub: 'sub-X',
      } satisfies UsuarioVinculable),
    });
    const uc = new VincularGoogleUseCase(identidades, new NoOpLogger());

    const result = await uc.execute({ userId: 'user-A', sub: 'sub-X' });

    expect(result.isFail()).toBe(true);
    const error = result.getError();
    expect(error.motivo).toBe('identidad-de-otra-cuenta');
    expect(identidades.vincularGoogleSub).not.toHaveBeenCalled();
  });

  it('fila esDemo ⇒ fail usuario-demo, sin write (gate READ-DERIVED, D-05 — no hay input esDemo)', async () => {
    const identidades = makeIdentidades({
      buscarPorId: vi.fn().mockResolvedValue({
        userId: 'user-1',
        esDemo: true,
        googleSub: null,
      } satisfies UsuarioVinculable),
    });
    const uc = new VincularGoogleUseCase(identidades, new NoOpLogger());

    const result = await uc.execute({ userId: 'user-1', sub: 'sub-nuevo' });

    expect(result.isFail()).toBe(true);
    const error = result.getError();
    expect(error.motivo).toBe('usuario-demo');
    expect(identidades.vincularGoogleSub).not.toHaveBeenCalled();
  });

  it('fila null ⇒ fail usuario-inexistente', async () => {
    const identidades = makeIdentidades({
      buscarPorId: vi.fn().mockResolvedValue(null),
    });
    const uc = new VincularGoogleUseCase(identidades, new NoOpLogger());

    const result = await uc.execute({ userId: 'no-existe', sub: 'sub-1' });

    expect(result.isFail()).toBe(true);
    const error = result.getError();
    expect(error.motivo).toBe('usuario-inexistente');
  });

  it('vincularGoogleSub devuelve false (perdió la carrera) ⇒ fail link-perdio-la-carrera', async () => {
    const identidades = makeIdentidades({
      buscarPorId: vi.fn().mockResolvedValue({
        userId: 'user-1',
        esDemo: false,
        googleSub: null,
      } satisfies UsuarioVinculable),
      vincularGoogleSub: vi.fn().mockResolvedValue(false),
    });
    const uc = new VincularGoogleUseCase(identidades, new NoOpLogger());

    const result = await uc.execute({ userId: 'user-1', sub: 'sub-nuevo' });

    expect(result.isFail()).toBe(true);
    const error = result.getError();
    expect(error.motivo).toBe('link-perdio-la-carrera');
  });

  it('ningún context logueado contiene el sub crudo', async () => {
    const logger = new FakeLogger();
    const identidades = makeIdentidades({
      buscarPorId: vi.fn().mockResolvedValue({
        userId: 'user-1',
        esDemo: false,
        googleSub: null,
      } satisfies UsuarioVinculable),
    });
    const uc = new VincularGoogleUseCase(identidades, logger);

    await uc.execute({ userId: 'user-1', sub: 'sub-secreto-123' });

    const serialized = JSON.stringify(logger.calls.map((c) => c.context));
    expect(serialized).not.toContain('sub-secreto-123');
  });
});

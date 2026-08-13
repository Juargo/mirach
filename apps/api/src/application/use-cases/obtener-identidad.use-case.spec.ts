import { ObtenerIdentidadUseCase } from './obtener-identidad.use-case';
import {
  IUserCredentialRepository,
  IdentidadUsuario,
} from '../ports/user-credential-repository.port';
import { SesionInvalidaError } from '../../domain/errors/sesion-invalida.error';
import { NoOpLogger, FakeLogger } from '../../../test/support/logger.double';

// ──────────────────────────────────────────────────────────────────────────────
// Unit tests — ObtenerIdentidadUseCase (mocked port). No infra, no DB.
// ──────────────────────────────────────────────────────────────────────────────

function makeMockCreds(
  identidad: IdentidadUsuario | null,
): IUserCredentialRepository {
  return {
    buscarPorEmail: vi.fn(),
    buscarIdentidad: vi.fn().mockResolvedValue(identidad),
    buscarCredencialPorId: vi.fn(),
    actualizarPerfil: vi.fn(),
    actualizarPassword: vi.fn(),
  };
}

describe('ObtenerIdentidadUseCase', () => {
  it('found → Result.ok({ userId, email })', async () => {
    const identidad: IdentidadUsuario = {
      userId: 'user-1',
      nombre: 'Jorge',
      email: 'jorge@example.com',
      esDemo: false,
    };
    const creds = makeMockCreds(identidad);
    const uc = new ObtenerIdentidadUseCase(creds, new NoOpLogger());

    const result = await uc.execute({ userId: 'user-1' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual(identidad);
    expect(creds.buscarIdentidad).toHaveBeenCalledWith('user-1');
  });

  it('buscarIdentidad returns null → Result.fail(SesionInvalidaError)', async () => {
    const creds = makeMockCreds(null);
    const uc = new ObtenerIdentidadUseCase(creds, new NoOpLogger());

    const result = await uc.execute({ userId: 'ghost-user' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SesionInvalidaError);
  });

  it('found (usuario demo) → pasa esDemo=true y email=null tal cual del repositorio (DEMO-AUTH-05)', async () => {
    const identidad: IdentidadUsuario = {
      userId: 'user-demo-1',
      nombre: 'Demo',
      email: null,
      esDemo: true,
    };
    const creds = makeMockCreds(identidad);
    const uc = new ObtenerIdentidadUseCase(creds, new NoOpLogger());

    const result = await uc.execute({ userId: 'user-demo-1' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual(identidad);
  });

  describe('debug logging (ADR-033 slice A — redaction contract, ADR-013)', () => {
    it('NUNCA incluye el email en los contexts logueados', async () => {
      const identidad: IdentidadUsuario = {
        userId: 'user-1',
        nombre: 'Jorge',
        email: 'jorge@example.com',
        esDemo: false,
      };
      const creds = makeMockCreds(identidad);
      const logger = new FakeLogger();
      const uc = new ObtenerIdentidadUseCase(creds, logger);

      await uc.execute({ userId: 'user-1' });

      const debugCalls = logger.calls.filter((c) => c.level === 'debug');
      expect(debugCalls.length).toBeGreaterThan(0);

      const serializedContexts = JSON.stringify(
        debugCalls.map((c) => c.context),
      );
      expect(serializedContexts).not.toContain('@');
      expect(serializedContexts).not.toContain('jorge@example.com');
    });
  });
});

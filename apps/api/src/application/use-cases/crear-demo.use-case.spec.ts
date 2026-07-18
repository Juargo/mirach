import { CrearDemoUseCase, generarNombreDemo } from './crear-demo.use-case';
import { IDemoRepository } from '../ports/demo-repository.port';
import { ISessionRepository } from '../ports/session-repository.port';
import { ISessionTokenService } from '../ports/session-token.port';
import { IReloj } from '../ports/reloj.port';

// ──────────────────────────────────────────────────────────────────────────────
// Unit tests — CrearDemoUseCase (mocked ports). No infra, no DB.
// ──────────────────────────────────────────────────────────────────────────────

describe('generarNombreDemo() (DEMO-AUTH-06)', () => {
  it('genera un nombre con el patrón Demo-{sufijo}', () => {
    expect(generarNombreDemo()).toMatch(/^Demo-[0-9a-f]{12}$/);
  });

  it('dos llamadas sin override generan sufijos distintos (no colisión)', () => {
    const nombres = new Set(Array.from({ length: 20 }, () => generarNombreDemo()));
    expect(nombres.size).toBe(20);
  });

  it('acepta un sufijo explícito (determinismo para tests)', () => {
    expect(generarNombreDemo('abc123')).toBe('Demo-abc123');
  });
});

describe('CrearDemoUseCase', () => {
  function makePorts(overrides?: {
    demoRepo?: Partial<IDemoRepository>;
    sessions?: Partial<ISessionRepository>;
    tokens?: Partial<ISessionTokenService>;
    reloj?: Partial<IReloj>;
  }) {
    const demoRepo: IDemoRepository = {
      crear: vi.fn().mockResolvedValue({ userId: 'user-demo-1', accountId: 'account-demo-1' }),
      ...overrides?.demoRepo,
    };
    const sessions: ISessionRepository = {
      crear: vi.fn().mockResolvedValue(undefined),
      buscarPorTokenHash: vi.fn(),
      revocarPorTokenHash: vi.fn(),
      ...overrides?.sessions,
    };
    const tokens: ISessionTokenService = {
      generar: vi.fn().mockReturnValue({ token: 'token-demo-abc', tokenHash: 'hash-demo-abc' }),
      hashToken: vi.fn(),
      ...overrides?.tokens,
    };
    const reloj: IReloj = {
      ahora: vi.fn().mockReturnValue(new Date('2026-07-18T12:00:00.000Z')),
      ...overrides?.reloj,
    };
    return { demoRepo, sessions, tokens, reloj };
  }

  it('crea el usuario demo, genera token y crea la sesión, en ese orden', async () => {
    const { demoRepo, sessions, tokens, reloj } = makePorts();
    const uc = new CrearDemoUseCase(demoRepo, sessions, tokens, reloj);

    const llamadas: string[] = [];
    (demoRepo.crear as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      llamadas.push('demoRepo.crear');
      return { userId: 'user-demo-1', accountId: 'account-demo-1' };
    });
    (tokens.generar as ReturnType<typeof vi.fn>).mockImplementation(() => {
      llamadas.push('tokens.generar');
      return { token: 'token-demo-abc', tokenHash: 'hash-demo-abc' };
    });
    (sessions.crear as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      llamadas.push('sessions.crear');
    });

    const result = await uc.execute();

    expect(llamadas).toEqual(['demoRepo.crear', 'tokens.generar', 'sessions.crear']);
    expect(result.userId).toBe('user-demo-1');
    expect(result.token).toBe('token-demo-abc');
    expect(result.expiresAt).toEqual(new Date('2026-07-25T12:00:00.000Z'));
  });

  it('pasa un nombre con el patrón Demo-{sufijo} a IDemoRepository.crear', async () => {
    const { demoRepo, sessions, tokens, reloj } = makePorts();
    const uc = new CrearDemoUseCase(demoRepo, sessions, tokens, reloj);

    await uc.execute();

    expect(demoRepo.crear).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: expect.stringMatching(/^Demo-[0-9a-f]{12}$/) }),
    );
  });

  it('crea la sesión con el userId devuelto por el repositorio demo y el tokenHash generado', async () => {
    const { demoRepo, sessions, tokens, reloj } = makePorts();
    const uc = new CrearDemoUseCase(demoRepo, sessions, tokens, reloj);

    await uc.execute();

    expect(sessions.crear).toHaveBeenCalledWith({
      userId: 'user-demo-1',
      tokenHash: 'hash-demo-abc',
      expiresAt: new Date('2026-07-25T12:00:00.000Z'),
    });
  });
});

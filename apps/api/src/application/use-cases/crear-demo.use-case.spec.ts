import { CrearDemoUseCase, generarNombreDemo } from './crear-demo.use-case';
import { IDemoRepository } from '../ports/demo-repository.port';
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
    const nombres = new Set(
      Array.from({ length: 20 }, () => generarNombreDemo()),
    );
    expect(nombres.size).toBe(20);
  });

  it('acepta un sufijo explícito (determinismo para tests)', () => {
    expect(generarNombreDemo('abc123')).toBe('Demo-abc123');
  });
});

describe('CrearDemoUseCase', () => {
  function makePorts(overrides?: {
    demoRepo?: Partial<IDemoRepository>;
    tokens?: Partial<ISessionTokenService>;
    reloj?: Partial<IReloj>;
  }) {
    const demoRepo: IDemoRepository = {
      crear: vi.fn().mockResolvedValue({
        userId: 'user-demo-1',
        accountId: 'account-demo-1',
      }),
      ...overrides?.demoRepo,
    };
    const tokens: ISessionTokenService = {
      generar: vi.fn().mockReturnValue({
        token: 'token-demo-abc',
        tokenHash: 'hash-demo-abc',
      }),
      hashToken: vi.fn(),
      ...overrides?.tokens,
    };
    const reloj: IReloj = {
      ahora: vi.fn().mockReturnValue(new Date('2026-07-18T12:00:00.000Z')),
      ...overrides?.reloj,
    };
    return { demoRepo, tokens, reloj };
  }

  it('genera el token y crea el usuario demo (con la sesión atómica dentro del repo), en ese orden', async () => {
    const { demoRepo, tokens, reloj } = makePorts();
    const uc = new CrearDemoUseCase(demoRepo, tokens, reloj);

    const llamadas: string[] = [];
    (tokens.generar as ReturnType<typeof vi.fn>).mockImplementation(() => {
      llamadas.push('tokens.generar');
      return { token: 'token-demo-abc', tokenHash: 'hash-demo-abc' };
    });
    (demoRepo.crear as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        llamadas.push('demoRepo.crear');
        return { userId: 'user-demo-1', accountId: 'account-demo-1' };
      },
    );

    const result = await uc.execute();

    expect(llamadas).toEqual(['tokens.generar', 'demoRepo.crear']);
    expect(result.userId).toBe('user-demo-1');
    expect(result.token).toBe('token-demo-abc');
    expect(result.expiresAt).toEqual(new Date('2026-07-25T12:00:00.000Z'));
  });

  it('pasa un nombre con el patrón Demo-{sufijo} a IDemoRepository.crear', async () => {
    const { demoRepo, tokens, reloj } = makePorts();
    const uc = new CrearDemoUseCase(demoRepo, tokens, reloj);

    await uc.execute();

    expect(demoRepo.crear).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: expect.stringMatching(/^Demo-[0-9a-f]{12}$/),
      }),
    );
  });

  it('pasa el tokenHash generado y el expiresAt calculado a IDemoRepository.crear, para que la sesión se cree ATÓMICAMENTE con el usuario (fix crítico DEMO-DATA-04)', async () => {
    const { demoRepo, tokens, reloj } = makePorts();
    const uc = new CrearDemoUseCase(demoRepo, tokens, reloj);

    await uc.execute();

    expect(demoRepo.crear).toHaveBeenCalledWith({
      nombre: expect.stringMatching(/^Demo-[0-9a-f]{12}$/),
      tokenHash: 'hash-demo-abc',
      expiresAt: new Date('2026-07-25T12:00:00.000Z'),
    });
  });

  it('si IDemoRepository.crear falla (incluye el insert de la sesión, misma $transaction) → el use case rechaza sin dejar estado parcial expuesto (no hay una segunda escritura separada que orfanice al usuario)', async () => {
    const { demoRepo, tokens, reloj } = makePorts({
      demoRepo: {
        crear: vi.fn().mockRejectedValue(new Error('DB connection lost')),
      },
    });
    const uc = new CrearDemoUseCase(demoRepo, tokens, reloj);

    await expect(uc.execute()).rejects.toThrow('DB connection lost');
  });
});

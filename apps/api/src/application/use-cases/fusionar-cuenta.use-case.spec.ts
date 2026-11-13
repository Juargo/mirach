import { FusionarCuentaUseCase } from './fusionar-cuenta.use-case';
import type { ResumenFusion } from '../ports/fusion-cuentas-repository.port';

const AHORA = new Date('2026-11-12T12:00:00.000Z');
const FUTURO = new Date('2027-11-12T12:00:00.000Z');

const RESUMEN: ResumenFusion = {
  cuentasMovidas: 1,
  cuentasUnidas: 2,
  movimientosMovidos: 30,
  duplicadosOmitidos: 4,
  categoriasMovidas: 3,
  patronesMovidos: 5,
};

function armar(
  over: {
    destinoAnonimo?: boolean;
    sesion?: {
      userId: string;
      expiresAt: Date;
      anonima?: boolean;
    } | null;
    resumen?: ResumenFusion | null;
  } = {},
) {
  const cuentas = {
    esAnonima: vi.fn().mockResolvedValue(over.destinoAnonimo ?? false),
  };
  const sessions = {
    buscarPorTokenHash: vi
      .fn()
      .mockResolvedValue(
        over.sesion === undefined
          ? { userId: 'anon-1', expiresAt: FUTURO, anonima: true }
          : over.sesion,
      ),
  };
  const tokens = { hashToken: vi.fn((t: string) => `hash:${t}`) };
  const fusion = {
    fusionar: vi
      .fn()
      .mockResolvedValue(over.resumen === undefined ? RESUMEN : over.resumen),
  };
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const useCase = new FusionarCuentaUseCase(
    cuentas as never,
    sessions as never,
    tokens as never,
    { ahora: () => AHORA },
    fusion,
    logger,
  );
  return { useCase, cuentas, sessions, tokens, fusion, logger };
}

const ENTRADA = { destinoUserId: 'dest-1', tokenOrigen: 'tok-origen' };

describe('FusionarCuentaUseCase (ADR-014)', () => {
  it('fusiona el origen del token en el destino y devuelve los conteos', async () => {
    const t = armar();

    const r = await t.useCase.execute(ENTRADA);

    expect(r.isOk()).toBe(true);
    expect(r.getValue()).toEqual(RESUMEN);
    expect(t.tokens.hashToken).toHaveBeenCalledWith('tok-origen');
    expect(t.sessions.buscarPorTokenHash).toHaveBeenCalledWith(
      'hash:tok-origen',
    );
    expect(t.fusion.fusionar).toHaveBeenCalledWith('anon-1', 'dest-1');
  });

  it.each([
    ['token desconocido', null],
    [
      'sesión vencida',
      { userId: 'anon-1', expiresAt: AHORA, anonima: true } as const,
    ],
    [
      'cuenta de origen no anónima',
      { userId: 'otro', expiresAt: FUTURO, anonima: false } as const,
    ],
    [
      'cuenta de origen sin marca de anónima',
      { userId: 'otro', expiresAt: FUTURO } as const,
    ],
    [
      'el origen es el propio destino',
      { userId: 'dest-1', expiresAt: FUTURO, anonima: true } as const,
    ],
  ])('origen inválido (%s): rechaza y no escribe', async (_n, sesion) => {
    const t = armar({ sesion });

    const r = await t.useCase.execute(ENTRADA);

    expect(r.isFail()).toBe(true);
    expect(r.getError().motivo).toBe('origen-invalido');
    expect(t.fusion.fusionar).not.toHaveBeenCalled();
  });

  it('destino anónimo: rechaza sin siquiera mirar el token ni escribir', async () => {
    const t = armar({ destinoAnonimo: true });

    const r = await t.useCase.execute(ENTRADA);

    expect(r.getError().motivo).toBe('destino-anonimo');
    expect(t.cuentas.esAnonima).toHaveBeenCalledWith('dest-1');
    expect(t.sessions.buscarPorTokenHash).not.toHaveBeenCalled();
    expect(t.fusion.fusionar).not.toHaveBeenCalled();
  });

  it('si la transacción descubre que el origen ya no es válido, responde origen inválido', async () => {
    const t = armar({ resumen: null });

    const r = await t.useCase.execute(ENTRADA);

    expect(r.getError().motivo).toBe('origen-invalido');
  });

  it('nunca loguea el token ni los conteos de dinero: solo ids y conteos', async () => {
    const t = armar();

    await t.useCase.execute(ENTRADA);

    const volcado = JSON.stringify([
      t.logger.info.mock.calls,
      t.logger.debug.mock.calls,
      t.logger.warn.mock.calls,
    ]);
    expect(volcado).not.toContain('tok-origen');
    expect(volcado).not.toContain('hash:tok-origen');
  });
});

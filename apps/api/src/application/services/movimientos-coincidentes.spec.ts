import { PatronClasificacion } from '../../domain/value-objects/patron-clasificacion';
import { Bucket } from '../../domain/value-objects/bucket';
import { CategorizarTransaccionUseCase } from '../use-cases/categorizar-transaccion.use-case';
import { MovimientoParaAprender } from '../ports/movimientos-para-aprender.port';
import { seleccionarMovimientosCoincidentes } from './movimientos-coincidentes';

const TRANSPORTE = {
  id: 'cat-transporte',
  nombre: 'Transporte',
  bucket: Bucket.Deseos,
};
const COMIDA = { id: 'cat-comida', nombre: 'Comida', bucket: Bucket.Deseos };
const DESTINO = 'cat-destino';

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const categorizar = new CategorizarTransaccionUseCase(logger);

function patron(
  id: string,
  texto: string,
  categoria = TRANSPORTE,
  creadoEn = new Date('2026-01-01'),
): PatronClasificacion {
  return new PatronClasificacion({
    id,
    patron: texto,
    matchType: 'CONTAINS',
    categoria,
    prioridad: 100,
    creadoEn,
  });
}

function mov(
  id: string,
  descripcion: string,
  overrides: Partial<MovimientoParaAprender> = {},
): MovimientoParaAprender {
  return {
    id,
    fecha: new Date('2026-07-10'),
    descripcion,
    cargo: 5000n,
    abono: 0n,
    categoriaIdActual: 'cat-otra',
    clasificacionManual: false,
    ...overrides,
  };
}

function ids(r: ReadonlyArray<MovimientoParaAprender>): string[] {
  return r.map((m) => m.id);
}

describe('seleccionarMovimientosCoincidentes (S2)', () => {
  it('counts a movement the candidate matches when nothing longer wins', () => {
    const r = seleccionarMovimientosCoincidentes({
      categorizar,
      patrones: [],
      candidato: { patron: 'cabify', matchType: 'CONTAINS' },
      categoriaDestinoId: DESTINO,
      movimientos: [mov('m-1', 'MERPAGO*CABIFY 123'), mov('m-2', 'JUMBO')],
    });
    expect(ids(r)).toEqual(['m-1']);
  });

  it('folds accents (CLA-14): "cafe" catches "CAFÉ"', () => {
    const r = seleccionarMovimientosCoincidentes({
      categorizar,
      patrones: [],
      candidato: { patron: 'cafe', matchType: 'CONTAINS' },
      categoriaDestinoId: DESTINO,
      movimientos: [mov('m-1', 'CAFÉ DEL BARRIO')],
    });
    expect(ids(r)).toEqual(['m-1']);
  });

  it('CLA-12: a longer existing pattern wins, so the row does not count', () => {
    const r = seleccionarMovimientosCoincidentes({
      categorizar,
      patrones: [patron('p-ue', 'uber eats', COMIDA)],
      candidato: { patron: 'uber', matchType: 'CONTAINS' },
      categoriaDestinoId: DESTINO,
      movimientos: [mov('m-1', 'UBER EATS SANTIAGO'), mov('m-2', 'UBER TRIP')],
    });
    expect(ids(r)).toEqual(['m-2']);
  });

  it('CLA-12: on equal length the existing (older) pattern wins over the new one', () => {
    const r = seleccionarMovimientosCoincidentes({
      categorizar,
      patrones: [patron('p-ab', 'abcd', COMIDA)],
      candidato: { patron: 'wxyz', matchType: 'CONTAINS' },
      categoriaDestinoId: DESTINO,
      movimientos: [mov('m-1', 'ABCD WXYZ')],
    });
    expect(ids(r)).toEqual([]);
  });

  it('excludes incomes, manual rows and rows already in the target category', () => {
    const r = seleccionarMovimientosCoincidentes({
      categorizar,
      patrones: [],
      candidato: { patron: 'cabify', matchType: 'CONTAINS' },
      categoriaDestinoId: DESTINO,
      movimientos: [
        mov('ingreso', 'CABIFY REEMBOLSO', { cargo: 0n, abono: 5000n }),
        mov('manual', 'CABIFY', { clasificacionManual: true }),
        mov('ya-alli', 'CABIFY', { categoriaIdActual: DESTINO }),
        mov('ok', 'CABIFY'),
      ],
    });
    expect(ids(r)).toEqual(['ok']);
  });

  it('excluirIds leaves out the given movements', () => {
    const r = seleccionarMovimientosCoincidentes({
      categorizar,
      patrones: [],
      candidato: { patron: 'cabify', matchType: 'CONTAINS' },
      categoriaDestinoId: DESTINO,
      movimientos: [mov('m-1', 'CABIFY'), mov('m-2', 'CABIFY')],
      excluirIds: ['m-1'],
    });
    expect(ids(r)).toEqual(['m-2']);
  });

  it('an existing pattern with the same text is evaluated as moved, keeping its age', () => {
    // "cabify" exists (old) in Transporte; "cabify" moved to the target must
    // still beat a same-length newer pattern, because it keeps its creadoEn.
    const r = seleccionarMovimientosCoincidentes({
      categorizar,
      patrones: [
        patron('p-new', 'zzzzzz', COMIDA, new Date('2026-06-01')),
        patron('p-cab', 'Cabify', TRANSPORTE, new Date('2025-01-01')),
      ],
      candidato: { patron: 'cabify', matchType: 'CONTAINS' },
      categoriaDestinoId: DESTINO,
      movimientos: [
        mov('m-1', 'CABIFY ZZZZZZ', { categoriaIdActual: TRANSPORTE.id }),
      ],
    });
    expect(ids(r)).toEqual(['m-1']);
  });
});

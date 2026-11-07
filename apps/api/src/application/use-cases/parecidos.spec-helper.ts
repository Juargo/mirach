import { Result } from '../../shared/result';
import { Bucket } from '../../domain/value-objects/bucket';
import { PatronClasificacion } from '../../domain/value-objects/patron-clasificacion';
import { ICategoriaRepository } from '../ports/categoria-repository.port';
import {
  IMovimientosParaAprenderReader,
  MovimientoParaAprender,
} from '../ports/movimientos-para-aprender.port';
import { IAprendizajeClasificacionWriter } from '../ports/aprendizaje-clasificacion-writer.port';
import { PlanificadorAprendizaje } from '../services/planificador-aprendizaje';
import { CategorizarTransaccionUseCase } from './categorizar-transaccion.use-case';
import { NoOpLogger } from '../../../test/support/logger.double';
import { perfilReaderConCorte } from '../../../test/support/perfil-presupuesto-reader.double';

/** Shared doubles for the S6 use case specs (not a spec itself). */
export const DESTINO = {
  id: 'cat-transporte',
  nombre: 'Transporte',
  bucket: Bucket.Deseos,
  patrones: [],
  transaccionesCount: 0,
  icono: null,
  esInterna: false,
};

export function mov(
  id: string,
  descripcion: string,
  overrides: Partial<MovimientoParaAprender> = {},
): MovimientoParaAprender {
  return {
    id,
    fecha: new Date('2026-07-10T00:00:00.000Z'),
    descripcion,
    cargo: 4500n,
    abono: 0n,
    categoriaIdActual: 'cat-otra',
    clasificacionManual: false,
    ...overrides,
  };
}

export function patronEn(
  id: string,
  texto: string,
  categoria: { id: string; nombre: string; bucket: Bucket },
): PatronClasificacion {
  return new PatronClasificacion({
    id,
    patron: texto,
    matchType: 'CONTAINS',
    categoria,
    prioridad: 100,
  });
}

export function construirDobles(opts: {
  movimiento?: MovimientoParaAprender | null;
  categoria?: typeof DESTINO | null;
  patrones?: PatronClasificacion[];
  delPeriodo?: MovimientoParaAprender[];
}) {
  const movimiento =
    opts.movimiento === undefined
      ? mov('tx-1', 'MERPAGO*CABIFY 1234')
      : opts.movimiento;
  const categoriaRepo = {
    buscarPorId: vi
      .fn()
      .mockResolvedValue(
        opts.categoria === undefined ? DESTINO : opts.categoria,
      ),
  } as unknown as ICategoriaRepository;
  const reader: IMovimientosParaAprenderReader = {
    buscarPorId: vi.fn().mockResolvedValue(movimiento),
    buscarDelPeriodo: vi
      .fn()
      .mockResolvedValue(opts.delPeriodo ?? (movimiento ? [movimiento] : [])),
  };
  const planificador = new PlanificadorAprendizaje(
    {
      findAll: vi.fn().mockResolvedValue(Result.ok(opts.patrones ?? [])),
      buscarCategoriaPorDefecto: vi.fn(),
    },
    reader,
    perfilReaderConCorte(1),
    { ultimoPeriodoConDatos: vi.fn().mockResolvedValue(null) },
    new CategorizarTransaccionUseCase(new NoOpLogger()),
  );
  const writer: IAprendizajeClasificacionWriter = {
    aplicar: vi.fn().mockResolvedValue(
      Result.ok({
        patron: {
          id: 'pat-1',
          categoriaId: DESTINO.id,
          patron: 'cabify',
          matchType: 'CONTAINS',
          prioridad: 100,
        },
        categoria: {
          id: DESTINO.id,
          nombre: DESTINO.nombre,
          bucket: DESTINO.bucket,
        },
        movidos: 2,
      }),
    ),
  };
  return { categoriaRepo, reader, planificador, writer };
}

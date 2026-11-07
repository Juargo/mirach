import { Result } from '../../shared/result';
import { Bucket } from '../../domain/value-objects/bucket';
import { PatronClasificacion } from '../../domain/value-objects/patron-clasificacion';
import { CategoriaNoEncontradaError } from '../../domain/errors/categoria-no-encontrada.error';
import { CategoriaInternaProtegidaError } from '../../domain/errors/categoria-interna-protegida.error';
import { PatronInvalidoError } from '../../domain/errors/patron-invalido.error';
import { PeriodoInvalidoError } from '../../domain/errors/periodo-invalido.error';
import { CategorizacionFallidaError } from '../../domain/errors/categorizacion-fallida.error';
import { ICategoriaRepository } from '../ports/categoria-repository.port';
import { ICatalogoClasificacion } from '../ports/catalogo-clasificacion.port';
import {
  IMovimientosParaAprenderReader,
  MovimientoParaAprender,
} from '../ports/movimientos-para-aprender.port';
import { IUltimoPeriodoConDatosReader } from '../ports/ultimo-periodo-con-datos.port';
import { CategorizarTransaccionUseCase } from './categorizar-transaccion.use-case';
import { PlanificadorAprendizaje } from '../services/planificador-aprendizaje';
import { VistaPreviaPatronUseCase } from './vista-previa-patron.use-case';
import { NoOpLogger } from '../../../test/support/logger.double';
import { perfilReaderConCorte } from '../../../test/support/perfil-presupuesto-reader.double';

const DESTINO = {
  id: 'cat-transporte',
  nombre: 'Transporte',
  bucket: Bucket.Deseos,
  patrones: [],
  transaccionesCount: 0,
  icono: null,
  esInterna: false,
};

function mov(
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

function construir(opts: {
  categoria?: typeof DESTINO | null;
  patrones?: PatronClasificacion[];
  catalogoCaido?: boolean;
  movimientos?: MovimientoParaAprender[];
  ultimo?: string | null;
}) {
  const categoriaRepo = {
    buscarPorId: vi
      .fn()
      .mockResolvedValue(
        opts.categoria === undefined ? DESTINO : opts.categoria,
      ),
  } as unknown as ICategoriaRepository;
  const catalogo: ICatalogoClasificacion = {
    findAll: vi
      .fn()
      .mockResolvedValue(
        opts.catalogoCaido
          ? Result.fail(new CategorizacionFallidaError('caído'))
          : Result.ok(opts.patrones ?? []),
      ),
    buscarCategoriaPorDefecto: vi.fn(),
  };
  const reader: IMovimientosParaAprenderReader = {
    buscarDelPeriodo: vi.fn().mockResolvedValue(opts.movimientos ?? []),
    buscarPorId: vi.fn(),
  };
  const ultimoReader: IUltimoPeriodoConDatosReader = {
    ultimoPeriodoConDatos: vi.fn().mockResolvedValue(null),
  };
  const planificador = new PlanificadorAprendizaje(
    catalogo,
    reader,
    perfilReaderConCorte(1),
    ultimoReader,
    new CategorizarTransaccionUseCase(new NoOpLogger()),
  );
  return {
    useCase: new VistaPreviaPatronUseCase(categoriaRepo, planificador),
    reader,
    ultimoReader,
  };
}

describe('VistaPreviaPatronUseCase (CLA-15, S3)', () => {
  it('lists the coinciding movements of the requested periodo and their count', async () => {
    const { useCase, reader } = construir({
      movimientos: [
        mov('m-1', 'MERPAGO*CABIFY 123'),
        mov('m-2', 'JUMBO'),
        mov('m-3', 'CABIFY', { clasificacionManual: true }),
      ],
    });

    const r = await useCase.execute({
      userId: 'user-1',
      categoriaId: DESTINO.id,
      patron: ' Cabify ',
      periodo: '2026-07',
    });

    expect(r.isOk()).toBe(true);
    const v = r.getValue();
    expect(v.periodo).toBe('2026-07');
    expect(v.patron).toBe('cabify');
    expect(v.coincidencias.map((m) => m.id)).toEqual(['m-1']);
    expect(v.existente).toBeNull();
    const [userId, periodo] = (
      reader.buscarDelPeriodo as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect(userId).toBe('user-1');
    expect(periodo.valor).toBe('2026-07');
  });

  it('reports the pattern that already holds the text, folding accents (CLA-17)', async () => {
    const existente = new PatronClasificacion({
      id: 'p-cafe',
      patron: 'Café',
      matchType: 'CONTAINS',
      categoria: { id: 'cat-cafes', nombre: 'Cafés', bucket: Bucket.Deseos },
      prioridad: 100,
    });
    const { useCase } = construir({ patrones: [existente] });

    const r = await useCase.execute({
      userId: 'user-1',
      categoriaId: DESTINO.id,
      patron: 'cafe',
      periodo: '2026-07',
    });

    expect(r.getValue().existente).toEqual({
      patronId: 'p-cafe',
      categoriaId: 'cat-cafes',
      categoria: 'Cafés',
      bucket: Bucket.Deseos,
    });
  });

  it('a missing periodo resolves to the last month with data (resolverPeriodo)', async () => {
    const { useCase, ultimoReader } = construir({});

    await useCase.execute({
      userId: 'user-1',
      categoriaId: DESTINO.id,
      patron: 'cabify',
    });

    expect(ultimoReader.ultimoPeriodoConDatos).toHaveBeenCalled();
  });

  it("404 when the category is not the caller's", async () => {
    const { useCase, reader } = construir({ categoria: null });
    const r = await useCase.execute({
      userId: 'user-1',
      categoriaId: 'ajena',
      patron: 'cabify',
    });
    expect(r.getError()).toBeInstanceOf(CategoriaNoEncontradaError);
    expect(reader.buscarDelPeriodo).not.toHaveBeenCalled();
  });

  it('403 on an internal category (CLA-18)', async () => {
    const { useCase } = construir({
      categoria: { ...DESTINO, esInterna: true },
    });
    const r = await useCase.execute({
      userId: 'user-1',
      categoriaId: DESTINO.id,
      patron: 'cabify',
    });
    expect(r.getError()).toBeInstanceOf(CategoriaInternaProtegidaError);
  });

  it('400 on an empty pattern, like creating one', async () => {
    const { useCase } = construir({});
    const r = await useCase.execute({
      userId: 'user-1',
      categoriaId: DESTINO.id,
      patron: '   ',
    });
    expect(r.getError()).toBeInstanceOf(PatronInvalidoError);
  });

  it('400 on an invalid periodo', async () => {
    const { useCase } = construir({});
    const r = await useCase.execute({
      userId: 'user-1',
      categoriaId: DESTINO.id,
      patron: 'cabify',
      periodo: '2026-13',
    });
    expect(r.getError()).toBeInstanceOf(PeriodoInvalidoError);
  });

  it('fails when the catalog cannot be read', async () => {
    const { useCase } = construir({ catalogoCaido: true });
    const r = await useCase.execute({
      userId: 'user-1',
      categoriaId: DESTINO.id,
      patron: 'cabify',
      periodo: '2026-07',
    });
    expect(r.getError()).toBeInstanceOf(CategorizacionFallidaError);
  });
});

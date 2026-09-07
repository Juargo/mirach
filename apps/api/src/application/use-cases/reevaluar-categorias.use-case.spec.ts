import { ReevaluarCategoriasUseCase } from './reevaluar-categorias.use-case';
import { CategorizarTransaccionUseCase } from './categorizar-transaccion.use-case';
import { ICatalogoClasificacion } from '../ports/catalogo-clasificacion.port';
import {
  IReevaluarCategoriasReader,
  TransaccionParaReevaluar,
} from '../ports/reevaluar-categorias-reader.port';
import { IReevaluarCategoriasWriter } from '../ports/reevaluar-categorias-writer.port';
import { Result } from '../../shared/result';
import { Bucket } from '../../domain/value-objects/bucket';
import { PatronClasificacion } from '../../domain/value-objects/patron-clasificacion';
import { CategorizacionFallidaError } from '../../domain/errors/categorizacion-fallida.error';
import { ReevaluarDemoSoloLecturaError } from '../../domain/errors/reevaluar-demo-solo-lectura.error';
import { NoOpLogger } from '../../../test/support/logger.double';

const CATEGORIA_SUPERMERCADO = {
  id: 'cat-supermercado',
  nombre: 'Supermercado',
  bucket: Bucket.Necesidades,
};

function patronSupermercado(): PatronClasificacion {
  return new PatronClasificacion({
    id: 'patron-1',
    patron: 'lider',
    matchType: 'CONTAINS',
    categoria: CATEGORIA_SUPERMERCADO,
    prioridad: 1,
  });
}

function makeCatalogo(
  patrones: ReadonlyArray<PatronClasificacion> = [],
): ICatalogoClasificacion {
  return { findAll: vi.fn().mockResolvedValue(Result.ok(patrones)) };
}

function makeReader(
  rows: ReadonlyArray<TransaccionParaReevaluar>,
): IReevaluarCategoriasReader {
  return { findTodasDelUsuario: vi.fn().mockResolvedValue(rows) };
}

function makeWriter(
  result: Result<
    { actualizadas: number },
    CategorizacionFallidaError
  > = Result.ok({ actualizadas: 0 }),
): IReevaluarCategoriasWriter {
  return { escribir: vi.fn().mockResolvedValue(result) };
}

function tx(
  overrides: Partial<TransaccionParaReevaluar>,
): TransaccionParaReevaluar {
  return {
    id: 'tx-1',
    descripcion: 'compra',
    cargo: 0n,
    abono: 0n,
    categoriaIdActual: null,
    bucketActual: Bucket.SinCategoria,
    ...overrides,
  };
}

describe('ReevaluarCategoriasUseCase', () => {
  it('demo gate: corta ANTES de tocar catálogo, reader o writer', async () => {
    const catalogo = makeCatalogo();
    const reader = makeReader([]);
    const writer = makeWriter();
    const useCase = new ReevaluarCategoriasUseCase(
      catalogo,
      reader,
      writer,
      new CategorizarTransaccionUseCase(new NoOpLogger()),
      new NoOpLogger(),
    );

    const result = await useCase.execute({ userId: 'user-demo', esDemo: true });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ReevaluarDemoSoloLecturaError);
    expect(catalogo.findAll).not.toHaveBeenCalled();
    expect(reader.findTodasDelUsuario).not.toHaveBeenCalled();
    expect(writer.escribir).not.toHaveBeenCalled();
  });

  it('propaga el error si el catálogo falla al cargar', async () => {
    const catalogoError = new CategorizacionFallidaError('boom');
    const catalogo: ICatalogoClasificacion = {
      findAll: vi.fn().mockResolvedValue(Result.fail(catalogoError)),
    };
    const reader = makeReader([]);
    const writer = makeWriter();
    const useCase = new ReevaluarCategoriasUseCase(
      catalogo,
      reader,
      writer,
      new CategorizarTransaccionUseCase(new NoOpLogger()),
      new NoOpLogger(),
    );

    const result = await useCase.execute({ userId: 'user-a', esDemo: false });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(catalogoError);
    expect(reader.findTodasDelUsuario).not.toHaveBeenCalled();
    expect(writer.escribir).not.toHaveBeenCalled();
  });

  it('una fila que matchea un patrón se escribe, sobrescribiendo su categoría/bucket previos', async () => {
    const catalogo = makeCatalogo([patronSupermercado()]);
    const rows = [
      tx({
        id: 'tx-1',
        descripcion: 'compra en Lider',
        cargo: 5000n,
        abono: 0n,
        categoriaIdActual: 'cat-otra',
        bucketActual: Bucket.Deseos,
      }),
    ];
    const reader = makeReader(rows);
    const writer = makeWriter(Result.ok({ actualizadas: 1 }));
    const useCase = new ReevaluarCategoriasUseCase(
      catalogo,
      reader,
      writer,
      new CategorizarTransaccionUseCase(new NoOpLogger()),
      new NoOpLogger(),
    );

    const result = await useCase.execute({ userId: 'user-a', esDemo: false });

    expect(result.isOk()).toBe(true);
    expect(writer.escribir).toHaveBeenCalledWith('user-a', [
      {
        transaccionId: 'tx-1',
        categoriaId: 'cat-supermercado',
        bucket: Bucket.Necesidades,
      },
    ]);
    expect(result.getValue()).toEqual({
      transaccionesEvaluadas: 1,
      transaccionesActualizadas: 1,
    });
  });

  it('la regla Ingreso es una clasificación determinada y también sobrescribe', async () => {
    const catalogo = makeCatalogo([]);
    const rows = [
      tx({
        id: 'tx-ingreso',
        descripcion: 'sueldo',
        cargo: 0n,
        abono: 100000n,
        categoriaIdActual: 'cat-vieja',
        bucketActual: Bucket.Necesidades,
      }),
    ];
    const reader = makeReader(rows);
    const writer = makeWriter(Result.ok({ actualizadas: 1 }));
    const useCase = new ReevaluarCategoriasUseCase(
      catalogo,
      reader,
      writer,
      new CategorizarTransaccionUseCase(new NoOpLogger()),
      new NoOpLogger(),
    );

    await useCase.execute({ userId: 'user-a', esDemo: false });

    expect(writer.escribir).toHaveBeenCalledWith('user-a', [
      {
        transaccionId: 'tx-ingreso',
        categoriaId: null,
        bucket: Bucket.Ingreso,
      },
    ]);
  });

  it('CRÍTICO: una fila que no matchea ningún patrón (SinCategoria) NO se escribe, queda exactamente como está', async () => {
    const catalogo = makeCatalogo([patronSupermercado()]);
    const rows = [
      tx({
        id: 'tx-sin-match',
        descripcion: 'algo random sin patrón',
        cargo: 1000n,
        abono: 0n,
        categoriaIdActual: 'cat-supermercado',
        bucketActual: Bucket.Necesidades,
      }),
    ];
    const reader = makeReader(rows);
    const writer = makeWriter(Result.ok({ actualizadas: 0 }));
    const useCase = new ReevaluarCategoriasUseCase(
      catalogo,
      reader,
      writer,
      new CategorizarTransaccionUseCase(new NoOpLogger()),
      new NoOpLogger(),
    );

    const result = await useCase.execute({ userId: 'user-a', esDemo: false });

    expect(writer.escribir).toHaveBeenCalledWith('user-a', []);
    expect(result.getValue()).toEqual({
      transaccionesEvaluadas: 1,
      transaccionesActualizadas: 0,
    });
  });

  it('una fila cuya clasificación determinada COINCIDE con la actual no se re-escribe (evita no-op updates)', async () => {
    const catalogo = makeCatalogo([patronSupermercado()]);
    const rows = [
      tx({
        id: 'tx-sin-cambio',
        descripcion: 'compra en Lider',
        cargo: 3000n,
        abono: 0n,
        categoriaIdActual: 'cat-supermercado',
        bucketActual: Bucket.Necesidades,
      }),
    ];
    const reader = makeReader(rows);
    const writer = makeWriter(Result.ok({ actualizadas: 0 }));
    const useCase = new ReevaluarCategoriasUseCase(
      catalogo,
      reader,
      writer,
      new CategorizarTransaccionUseCase(new NoOpLogger()),
      new NoOpLogger(),
    );

    const result = await useCase.execute({ userId: 'user-a', esDemo: false });

    expect(writer.escribir).toHaveBeenCalledWith('user-a', []);
    expect(result.getValue()).toEqual({
      transaccionesEvaluadas: 1,
      transaccionesActualizadas: 0,
    });
  });

  it('sin transacciones → ok con conteos en cero, sin llamar al writer', async () => {
    const catalogo = makeCatalogo([]);
    const reader = makeReader([]);
    const writer = makeWriter();
    const useCase = new ReevaluarCategoriasUseCase(
      catalogo,
      reader,
      writer,
      new CategorizarTransaccionUseCase(new NoOpLogger()),
      new NoOpLogger(),
    );

    const result = await useCase.execute({ userId: 'user-a', esDemo: false });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual({
      transaccionesEvaluadas: 0,
      transaccionesActualizadas: 0,
    });
    // El writer SÍ se invoca con un array vacío (uniforme con el caso
    // "ninguna fila cambió") — su propio contrato resuelve un array vacío
    // sin tocar la BD (ver IReevaluarCategoriasWriter).
    expect(writer.escribir).toHaveBeenCalledWith('user-a', []);
  });

  it('propaga el error si el writer falla', async () => {
    const catalogo = makeCatalogo([patronSupermercado()]);
    const rows = [
      tx({
        id: 'tx-1',
        descripcion: 'compra en Lider',
        categoriaIdActual: null,
        bucketActual: Bucket.SinCategoria,
      }),
    ];
    const reader = makeReader(rows);
    const writerError = new CategorizacionFallidaError('no se pudo escribir');
    const writer = makeWriter(Result.fail(writerError));
    const useCase = new ReevaluarCategoriasUseCase(
      catalogo,
      reader,
      writer,
      new CategorizarTransaccionUseCase(new NoOpLogger()),
      new NoOpLogger(),
    );

    const result = await useCase.execute({ userId: 'user-a', esDemo: false });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(writerError);
  });
});

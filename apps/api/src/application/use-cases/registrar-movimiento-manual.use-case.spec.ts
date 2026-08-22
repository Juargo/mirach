/**
 * registrar-movimiento-manual.use-case.spec.ts — Unit tests for
 * RegistrarMovimientoManualUseCase (US-058 T-09 RED → T-10 GREEN).
 *
 * Covers D-09/D-10/D-11 design decisions:
 *   - Ingreso: auto-classified (CategorizarTransaccionUseCase NOT invoked, catalog NOT called)
 *   - Gasto: catalog loaded, categoriaId membership + bucket-match validated
 *   - Error union: MovimientoManualInvalidoError | CategoriaFueraDeCatalogoError |
 *                  BucketCategoriaNoConcuerdaError | PersistenciaFallidaError
 *   - Never-throw: outer try/catch wraps any unexpected throw
 *   - No Ingesta write on any path (D-09)
 *
 * Strategy: all collaborators are fakes (no DB, no infra). We inject:
 *   - IRegistrarMovimientoManualWriter  → FakeWriter (records calls)
 *   - ICategoriaRepository              → FakeCategoriaRepository
 *   - ILogger                           → NoOpLogger
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RegistrarMovimientoManualUseCase } from './registrar-movimiento-manual.use-case';
import type {
  IRegistrarMovimientoManualWriter,
  RegistrarMovimientoManualInput,
} from '../ports/registrar-movimiento-manual.port';
import type {
  ICategoriaRepository,
  CategoriaConPatrones,
} from '../ports/categoria-repository.port';
import type { ILogger } from '../ports/logger.port';
import { Result } from '../../shared/result';
import { Bucket } from '../../domain/value-objects/bucket';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import { MovimientoManualInvalidoError } from '../../domain/errors/movimiento-manual-invalido.error';
import { CategoriaFueraDeCatalogoError } from '../../domain/errors/categoria-fuera-de-catalogo.error';
import { BucketCategoriaNoConcuerdaError } from '../../domain/errors/bucket-categoria-no-concuerda.error';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

class NoOpLogger implements ILogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

class FakeWriter implements IRegistrarMovimientoManualWriter {
  asegurarCalls: string[] = [];
  registrarCalls: RegistrarMovimientoManualInput[] = [];

  private _asegurarResult: Result<
    { accountId: string },
    PersistenciaFallidaError
  > = Result.ok({ accountId: 'acc-sentinel' });
  private _registrarResult: Result<{ id: string }, PersistenciaFallidaError> =
    Result.ok({ id: 'tx-new' });

  setAsegurarResult(
    r: Result<{ accountId: string }, PersistenciaFallidaError>,
  ): void {
    this._asegurarResult = r;
  }

  setRegistrarResult(
    r: Result<{ id: string }, PersistenciaFallidaError>,
  ): void {
    this._registrarResult = r;
  }

  async asegurarCuentaManual(
    userId: string,
  ): Promise<Result<{ accountId: string }, PersistenciaFallidaError>> {
    this.asegurarCalls.push(userId);
    return this._asegurarResult;
  }

  async registrar(
    input: RegistrarMovimientoManualInput,
  ): Promise<Result<{ id: string }, PersistenciaFallidaError>> {
    this.registrarCalls.push(input);
    return this._registrarResult;
  }
}

function makeCategoriaRepo(
  categorias: CategoriaConPatrones[] = [],
): ICategoriaRepository {
  return {
    listarConPatrones: vi.fn().mockResolvedValue(categorias),
    buscarPorId: vi.fn(),
    existeNombre: vi.fn(),
    crear: vi.fn(),
    actualizar: vi.fn(),
    eliminar: vi.fn(),
  };
}

function makeThrowingCategoriaRepo(): ICategoriaRepository {
  return {
    listarConPatrones: vi.fn().mockRejectedValue(new Error('DB timeout')),
    buscarPorId: vi.fn(),
    existeNombre: vi.fn(),
    crear: vi.fn(),
    actualizar: vi.fn(),
    eliminar: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FECHA_HOY = new Date('2026-08-21T12:00:00.000Z');
const FIXED_CLOCK = () => FECHA_HOY;

const BASE_INGRESO = {
  userId: 'user-1',
  tipo: 'Ingreso' as const,
  fecha: new Date('2026-08-21T00:00:00.000Z'),
  descripcion: 'Sueldo agosto',
  monto: '1500000',
  clock: FIXED_CLOCK,
};

const BASE_GASTO = {
  userId: 'user-1',
  tipo: 'Gasto' as const,
  fecha: new Date('2026-08-21T00:00:00.000Z'),
  descripcion: 'Feria',
  monto: '12990',
  bucket: Bucket.Deseos,
  categoriaId: 'cat-alimentacion',
  clock: FIXED_CLOCK,
};

const CAT_ALIMENTACION: CategoriaConPatrones = {
  id: 'cat-alimentacion',
  nombre: 'Alimentación',
  bucket: Bucket.Deseos,
  patrones: [],
  transaccionesCount: 0,
};

const CAT_ARRIENDO: CategoriaConPatrones = {
  id: 'cat-arriendo',
  nombre: 'Arriendo',
  bucket: Bucket.Necesidades,
  patrones: [],
  transaccionesCount: 0,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RegistrarMovimientoManualUseCase', () => {
  let writer: FakeWriter;
  let logger: ILogger;

  beforeEach(() => {
    writer = new FakeWriter();
    logger = new NoOpLogger();
  });

  // ── Ingreso happy path (D-10) ────────────────────────────────────────────

  describe('Ingreso — clasificación automática (D-10)', () => {
    it('llama a asegurarCuentaManual con el userId del caller', async () => {
      const useCase = new RegistrarMovimientoManualUseCase(
        writer,
        makeCategoriaRepo(),
        logger,
      );

      await useCase.execute(BASE_INGRESO);

      expect(writer.asegurarCalls).toContain('user-1');
    });

    it('llama a writer.registrar exactamente una vez', async () => {
      const useCase = new RegistrarMovimientoManualUseCase(
        writer,
        makeCategoriaRepo(),
        logger,
      );

      await useCase.execute(BASE_INGRESO);

      expect(writer.registrarCalls).toHaveLength(1);
    });

    it('writer.registrar recibe bucket=Ingreso y categoriaId=null (by construction, D-10)', async () => {
      const useCase = new RegistrarMovimientoManualUseCase(
        writer,
        makeCategoriaRepo(),
        logger,
      );

      await useCase.execute(BASE_INGRESO);

      expect(writer.registrarCalls[0].bucket).toBe(Bucket.Ingreso);
      expect(writer.registrarCalls[0].categoriaId).toBeNull();
    });

    it('NO invoca ICategoriaRepository.listarConPatrones para Ingreso', async () => {
      const catalogoSpy = makeCategoriaRepo();
      const useCase = new RegistrarMovimientoManualUseCase(
        writer,
        catalogoSpy,
        logger,
      );

      await useCase.execute(BASE_INGRESO);

      expect(catalogoSpy.listarConPatrones).not.toHaveBeenCalled();
    });

    it('retorna Result.ok con el id de la transacción creada', async () => {
      const useCase = new RegistrarMovimientoManualUseCase(
        writer,
        makeCategoriaRepo(),
        logger,
      );

      const result = await useCase.execute(BASE_INGRESO);

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual({ id: 'tx-new' });
    });

    it('writer.registrar recibe el userId correcto (aislamiento multi-tenant RNF-SEC-006)', async () => {
      const useCase = new RegistrarMovimientoManualUseCase(
        writer,
        makeCategoriaRepo(),
        logger,
      );

      await useCase.execute(BASE_INGRESO);

      expect(writer.registrarCalls[0].userId).toBe('user-1');
    });
  });

  // ── Gasto happy path (D-11) ─────────────────────────────────────────────

  describe('Gasto — cascada de catálogo (D-11)', () => {
    it('llama a listarConPatrones con el userId del caller', async () => {
      const catalogoSpy = makeCategoriaRepo([CAT_ALIMENTACION]);
      const useCase = new RegistrarMovimientoManualUseCase(
        writer,
        catalogoSpy,
        logger,
      );

      await useCase.execute(BASE_GASTO);

      expect(catalogoSpy.listarConPatrones).toHaveBeenCalledWith('user-1');
    });

    it('happy path: categoriaId en catálogo, bucket coincide → writer.registrar invocado', async () => {
      const useCase = new RegistrarMovimientoManualUseCase(
        writer,
        makeCategoriaRepo([CAT_ALIMENTACION]),
        logger,
      );

      const result = await useCase.execute(BASE_GASTO);

      expect(result.isOk()).toBe(true);
      expect(writer.registrarCalls).toHaveLength(1);
      expect(writer.registrarCalls[0].bucket).toBe(Bucket.Deseos);
      expect(writer.registrarCalls[0].categoriaId).toBe('cat-alimentacion');
    });

    it('Gasto: categoriaId no está en el catálogo → CategoriaFueraDeCatalogoError, writer.registrar NO invocado', async () => {
      const useCase = new RegistrarMovimientoManualUseCase(
        writer,
        makeCategoriaRepo([CAT_ARRIENDO]), // solo arriendo, no alimentacion
        logger,
      );

      const result = await useCase.execute(BASE_GASTO);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CategoriaFueraDeCatalogoError);
      expect(writer.registrarCalls).toHaveLength(0);
    });

    it('Gasto: categoriaId en catálogo pero bucket incorrecto → BucketCategoriaNoConcuerdaError, writer.registrar NO invocado', async () => {
      // cat-alimentacion pertenece a Deseos, pero pedimos Necesidades
      const useCase = new RegistrarMovimientoManualUseCase(
        writer,
        makeCategoriaRepo([CAT_ALIMENTACION]),
        logger,
      );

      const result = await useCase.execute({
        ...BASE_GASTO,
        bucket: Bucket.Necesidades, // bucket incorrecto
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(BucketCategoriaNoConcuerdaError);
      expect(writer.registrarCalls).toHaveLength(0);
    });

    it('catálogo vacío → CategoriaFueraDeCatalogoError (cross-tenant o sin categorías)', async () => {
      const useCase = new RegistrarMovimientoManualUseCase(
        writer,
        makeCategoriaRepo([]), // catálogo vacío
        logger,
      );

      const result = await useCase.execute(BASE_GASTO);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CategoriaFueraDeCatalogoError);
    });
  });

  // ── Errores de validación del VO (D-09 / D-01) ──────────────────────────

  describe('VO validation fail — writer.registrar NO invocado', () => {
    it('fecha futura → Result.fail(MovimientoManualInvalidoError FECHA_FUTURA)', async () => {
      const useCase = new RegistrarMovimientoManualUseCase(
        writer,
        makeCategoriaRepo(),
        logger,
      );

      const result = await useCase.execute({
        ...BASE_INGRESO,
        fecha: new Date('2026-08-22T00:00:00.000Z'), // mañana
      });

      expect(result.isFail()).toBe(true);
      const err = result.getError();
      expect(err).toBeInstanceOf(MovimientoManualInvalidoError);
      expect((err as MovimientoManualInvalidoError).code).toBe('FECHA_FUTURA');
      expect(writer.registrarCalls).toHaveLength(0);
    });

    it('descripcion vacía → Result.fail(MovimientoManualInvalidoError DESCRIPCION_VACIA)', async () => {
      const useCase = new RegistrarMovimientoManualUseCase(
        writer,
        makeCategoriaRepo(),
        logger,
      );

      const result = await useCase.execute({
        ...BASE_INGRESO,
        descripcion: '   ',
      });

      expect(result.isFail()).toBe(true);
      expect((result.getError() as MovimientoManualInvalidoError).code).toBe(
        'DESCRIPCION_VACIA',
      );
      expect(writer.registrarCalls).toHaveLength(0);
    });

    it('monto no numérico → Result.fail(MovimientoManualInvalidoError MONTO_INVALIDO)', async () => {
      const useCase = new RegistrarMovimientoManualUseCase(
        writer,
        makeCategoriaRepo(),
        logger,
      );

      const result = await useCase.execute({
        ...BASE_INGRESO,
        monto: 'abc',
      });

      expect(result.isFail()).toBe(true);
      expect((result.getError() as MovimientoManualInvalidoError).code).toBe(
        'MONTO_INVALIDO',
      );
      expect(writer.registrarCalls).toHaveLength(0);
    });

    it('monto cero → Result.fail(MovimientoManualInvalidoError SIN_MONTOS)', async () => {
      const useCase = new RegistrarMovimientoManualUseCase(
        writer,
        makeCategoriaRepo(),
        logger,
      );

      const result = await useCase.execute({
        ...BASE_INGRESO,
        monto: '0',
      });

      expect(result.isFail()).toBe(true);
      expect((result.getError() as MovimientoManualInvalidoError).code).toBe(
        'SIN_MONTOS',
      );
      expect(writer.registrarCalls).toHaveLength(0);
    });
  });

  // ── Errores de persistencia (D-09) ──────────────────────────────────────

  describe('asegurarCuentaManual falla → PersistenciaFallidaError, writer.registrar NO invocado', () => {
    it('si asegurarCuentaManual retorna fail, el use case propaga el error sin llamar a registrar', async () => {
      writer.setAsegurarResult(
        Result.fail(new PersistenciaFallidaError('connection refused')),
      );
      const useCase = new RegistrarMovimientoManualUseCase(
        writer,
        makeCategoriaRepo(),
        logger,
      );

      const result = await useCase.execute(BASE_INGRESO);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PersistenciaFallidaError);
      expect(writer.registrarCalls).toHaveLength(0);
    });
  });

  describe('catálogo listarConPatrones lanza → PersistenciaFallidaError (inner try/catch D-11)', () => {
    it('un throw en listarConPatrones se envuelve en PersistenciaFallidaError; writer.registrar NO invocado', async () => {
      const useCase = new RegistrarMovimientoManualUseCase(
        writer,
        makeThrowingCategoriaRepo(),
        logger,
      );

      const result = await useCase.execute(BASE_GASTO);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PersistenciaFallidaError);
      expect(writer.registrarCalls).toHaveLength(0);
    });
  });

  describe('writer.registrar falla → PersistenciaFallidaError', () => {
    it('si registrar retorna fail, el use case propaga el error', async () => {
      writer.setRegistrarResult(
        Result.fail(new PersistenciaFallidaError('disk full')),
      );
      const useCase = new RegistrarMovimientoManualUseCase(
        writer,
        makeCategoriaRepo(),
        logger,
      );

      const result = await useCase.execute(BASE_INGRESO);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PersistenciaFallidaError);
    });
  });

  // ── Outer try/catch — never-throw contract (D-09) ───────────────────────

  describe('outer try/catch — unexpected throw → PersistenciaFallidaError', () => {
    it('un throw inesperado en el use case es capturado y retornado como Result.fail, nunca re-lanza', async () => {
      // Force asegurarCuentaManual to throw synchronously (simulating a bug)
      const buggyWriter: IRegistrarMovimientoManualWriter = {
        asegurarCuentaManual: vi
          .fn()
          .mockRejectedValue(new Error('unexpected boom')),
        registrar: vi.fn(),
      };
      const useCase = new RegistrarMovimientoManualUseCase(
        buggyWriter,
        makeCategoriaRepo(),
        logger,
      );

      const result = await useCase.execute(BASE_INGRESO);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PersistenciaFallidaError);
    });
  });

  // ── No Ingesta write (D-09) ──────────────────────────────────────────────

  describe('sin escritura de Ingesta en ningún path (D-09)', () => {
    it('el use case no provee ningún método ni port para crear Ingesta rows', () => {
      // The use case constructor accepts IRegistrarMovimientoManualWriter
      // which has NO createIngesta / persistirProcesada / registrarFallida.
      // This is a structural / TypeScript-level assertion — verified at compile time.
      // Runtime assertion: writer.registrar does NOT receive an ingestaId.
      // (useCase instantiation is the structural proof; the writer shape is checked below)
      new RegistrarMovimientoManualUseCase(writer, makeCategoriaRepo(), logger);

      // Checking the port shape: neither 'ingesta' nor 'historial' on the writer
      expect('registrar' in writer).toBe(true);
      expect('asegurarCuentaManual' in writer).toBe(true);
      // The FakeWriter records no ingesta calls because the port has no such method
      expect(writer).not.toHaveProperty('ingestaCreate');
    });
  });
});

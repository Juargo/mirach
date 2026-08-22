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
 *   - execute() returns { id, vo } so the route can build the response DTO
 *     without a DB read-back (T-16/D-08)
 *
 * Strategy: all collaborators are fakes (no DB, no infra). We inject:
 *   - IRegistrarMovimientoManualWriter  → FakeWriter (records calls)
 *   - ICategoriaRepository              → FakeCategoriaRepository
 *   - ILogger                           → NoOpLogger
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RegistrarMovimientoManualUseCase,
  type RegistrarMovimientoManualCommand,
  type RegistrarMovimientoManualError,
} from './registrar-movimiento-manual.use-case';
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
import { MovimientoManual } from '../../domain/value-objects/movimiento-manual';

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

const BASE_INGRESO: RegistrarMovimientoManualCommand = {
  userId: 'user-1',
  tipo: 'Ingreso',
  fecha: new Date('2026-08-21T00:00:00.000Z'),
  descripcion: 'Sueldo agosto',
  monto: '1500000',
  clock: FIXED_CLOCK,
};

const BASE_GASTO: RegistrarMovimientoManualCommand = {
  userId: 'user-1',
  tipo: 'Gasto',
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

    it('writer.registrar recibe el accountId del centinela', async () => {
      const useCase = new RegistrarMovimientoManualUseCase(
        writer,
        makeCategoriaRepo(),
        logger,
      );

      await useCase.execute(BASE_INGRESO);

      expect(writer.registrarCalls[0].accountId).toBe('acc-sentinel');
    });

    it('writer.registrar recibe transaccion con cargo=0n y abono=monto (Ingreso XOR)', async () => {
      const useCase = new RegistrarMovimientoManualUseCase(
        writer,
        makeCategoriaRepo(),
        logger,
      );

      await useCase.execute(BASE_INGRESO);

      const { transaccion } = writer.registrarCalls[0];
      expect(transaccion.cargo).toBe(0n);
      expect(transaccion.abono).toBe(1500000n);
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

    it('retorna Result.ok con { id, vo } donde vo es el MovimientoManual construido (T-16/D-08)', async () => {
      const useCase = new RegistrarMovimientoManualUseCase(
        writer,
        makeCategoriaRepo(),
        logger,
      );

      const result = await useCase.execute(BASE_INGRESO);

      expect(result.isOk()).toBe(true);
      const value = result.getValue();
      expect(value.id).toBe('tx-new');
      expect(value.vo).toBeInstanceOf(MovimientoManual);
      // vo.transaccion matches the transaccion forwarded to writer.registrar
      expect(value.vo.transaccion).toBe(writer.registrarCalls[0].transaccion);
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

    it('writer.registrar recibe el accountId del centinela (Gasto)', async () => {
      const useCase = new RegistrarMovimientoManualUseCase(
        writer,
        makeCategoriaRepo([CAT_ALIMENTACION]),
        logger,
      );

      await useCase.execute(BASE_GASTO);

      expect(writer.registrarCalls[0].accountId).toBe('acc-sentinel');
    });

    it('writer.registrar recibe transaccion con cargo=monto y abono=0n (Gasto XOR)', async () => {
      const useCase = new RegistrarMovimientoManualUseCase(
        writer,
        makeCategoriaRepo([CAT_ALIMENTACION]),
        logger,
      );

      await useCase.execute(BASE_GASTO);

      const { transaccion } = writer.registrarCalls[0];
      expect(transaccion.cargo).toBe(12990n);
      expect(transaccion.abono).toBe(0n);
    });

    it('retorna Result.ok con { id, vo } en el happy path Gasto (T-16/D-08)', async () => {
      const useCase = new RegistrarMovimientoManualUseCase(
        writer,
        makeCategoriaRepo([CAT_ALIMENTACION]),
        logger,
      );

      const result = await useCase.execute(BASE_GASTO);

      expect(result.isOk()).toBe(true);
      const value = result.getValue();
      expect(value.id).toBe('tx-new');
      expect(value.vo).toBeInstanceOf(MovimientoManual);
      expect(value.vo.transaccion).toBe(writer.registrarCalls[0].transaccion);
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
      // Compile-time error-union check: covers the full union assignability on a Gasto failure path.
      const _errUnion: RegistrarMovimientoManualError = result.getError();
      void _errUnion;
      // D-11 step ordering: asegurar (step 2) completed before the catalog rejection (step 3)
      expect(writer.asegurarCalls).toHaveLength(1);
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
      // D-11 step ordering: asegurar (step 2) completed before the bucket-mismatch rejection (step 3)
      expect(writer.asegurarCalls).toHaveLength(1);
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

      // Derived from the fixed clock so a future change of FECHA_HOY cannot
      // silently invert this test's meaning (D-09 behavioral test).
      const fechaFutura = new Date(FECHA_HOY.getTime() + 24 * 60 * 60 * 1000);

      const result = await useCase.execute({
        ...BASE_INGRESO,
        fecha: fechaFutura,
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

  // ── D-11: asegurarCuentaManual falla en Gasto — catalog NOT called (D-11 step ordering) ──

  describe('asegurarCuentaManual falla en Gasto — catálogo NO invocado (D-11 paso 2 antes de 3)', () => {
    it('si asegurarCuentaManual falla en un Gasto, listarConPatrones NO se llama y registrar NO se llama', async () => {
      writer.setAsegurarResult(
        Result.fail(new PersistenciaFallidaError('connection refused')),
      );
      const catalogoSpy = makeCategoriaRepo([CAT_ALIMENTACION]);
      const useCase = new RegistrarMovimientoManualUseCase(
        writer,
        catalogoSpy,
        logger,
      );

      const result = await useCase.execute(BASE_GASTO);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PersistenciaFallidaError);
      // Step 3 (catalog) must NOT run when step 2 (sentinel) fails (D-11)
      expect(catalogoSpy.listarConPatrones).not.toHaveBeenCalled();
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
      // D-11 step ordering: asegurar (step 2) completed before registrar (step 5) failed
      expect(writer.asegurarCalls).toHaveLength(1);
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
  //
  // D-09: failed manual attempts register nothing — no Ingesta row, no historial.
  // The use case's port (IRegistrarMovimientoManualWriter) has NO createIngesta /
  // persistirProcesada / registrarFallida method — this is a compile-time guarantee.
  // The behavioral guarantee: on both happy and failure paths, ONLY
  // `asegurarCuentaManual` and `registrar` are ever invoked; `registrar` is
  // skipped entirely on failure paths.

  describe('sin escritura de Ingesta en ningún path (D-09)', () => {
    it('happy path Ingreso: solo asegurarCuentaManual + registrar son invocados (call log completo)', async () => {
      const useCase = new RegistrarMovimientoManualUseCase(
        writer,
        makeCategoriaRepo(),
        logger,
      );

      const result = await useCase.execute(BASE_INGRESO);

      expect(result.isOk()).toBe(true);
      // Exactly one asegurar call, exactly one registrar call — nothing else
      expect(writer.asegurarCalls).toHaveLength(1);
      expect(writer.asegurarCalls[0]).toBe('user-1');
      expect(writer.registrarCalls).toHaveLength(1);
      // The writer shape has no ingesta method — structural compile-time guarantee
      expect(writer).not.toHaveProperty('ingestaCreate');
      expect(writer).not.toHaveProperty('persistirProcesada');
      expect(writer).not.toHaveProperty('registrarFallida');
    });

    it('failure path (VO invalido): registrar NO es invocado — call log completo', async () => {
      const useCase = new RegistrarMovimientoManualUseCase(
        writer,
        makeCategoriaRepo(),
        logger,
      );

      // VO will fail: future date
      const result = await useCase.execute({
        ...BASE_INGRESO,
        fecha: new Date('2030-01-01T00:00:00.000Z'),
      });

      expect(result.isFail()).toBe(true);
      // Compile-time error-union check: assign getError() to the full union type
      // so tsc enforces T-09's exhaustiveness deliverable (D-09).
      const _errUnion: RegistrarMovimientoManualError = result.getError();
      void _errUnion;

      // No write calls on any failure path
      expect(writer.asegurarCalls).toHaveLength(0);
      expect(writer.registrarCalls).toHaveLength(0);
    });
  });
});

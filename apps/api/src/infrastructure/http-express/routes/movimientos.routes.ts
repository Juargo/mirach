import type { Router } from 'express';
import { ObtenerMovimientosMesUseCase } from '../../../application/use-cases/obtener-movimientos-mes.use-case';
import { RegistrarMovimientoManualUseCase } from '../../../application/use-cases/registrar-movimiento-manual.use-case';
import { PeriodoInvalidoError } from '../../../domain/errors/periodo-invalido.error';
import { MovimientoManualInvalidoError } from '../../../domain/errors/movimiento-manual-invalido.error';
import { CategoriaFueraDeCatalogoError } from '../../../domain/errors/categoria-fuera-de-catalogo.error';
import { BucketCategoriaNoConcuerdaError } from '../../../domain/errors/bucket-categoria-no-concuerda.error';
import { PersistenciaFallidaError } from '../../../domain/errors/persistencia-fallida.error';
import { Bucket } from '../../../domain/value-objects/bucket';
import { aMovimientosMesDto } from '../../http/dto/movimiento-mes.dto';
import { aRegistrarMovimientoManualResponseDto } from '../../http/dto/movimiento-manual.dto';
import { movimientosQuerySchema } from '../schemas/movimientos.schema';
import { registrarMovimientoManualSchema } from '../schemas/movimiento-manual.schema';

/**
 * registrarMovimientos — port del MovimientosController (ADR-028).
 *
 * GET /api/movimientos?periodo=YYYY-MM → lista mensual consolidada (US-014).
 *
 * `userId` viene del session middleware. `PeriodoInvalidoError` → 400
 * scrubbeado (nunca refleja el input crudo). Lista vacía → 200 (no es error).
 */
export function registrarMovimientos(
  router: Router,
  obtenerMovimientosMes: ObtenerMovimientosMesUseCase,
): void {
  // NOTE: This function registers only the GET /movimientos handler.
  // The POST /movimientos handler lives in registrarMovimientoManual below
  // (sibling function pattern — D-12, T-19).
  router.get('/movimientos', async (req, res, next) => {
    try {
      // Boundary schema validates TRANSPORT SHAPE ONLY (openapi-contract-express
      // design, layer-honesty gate) — it does NOT know the YYYY-MM format rule,
      // that stays a domain concern (PeriodoMes VO) handled below.
      const parsedQuery = movimientosQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) {
        res.status(400).json({
          message: 'Parámetros de consulta inválidos.',
        });
        return;
      }

      const result = await obtenerMovimientosMes.execute({
        userId: req.userId!, // garantizado por el session middleware previo
        periodo: parsedQuery.data.periodo,
      });

      if (result.isFail()) {
        const error = result.getError();
        if (error instanceof PeriodoInvalidoError) {
          res.status(400).json({
            message:
              'El período no es válido. Formato esperado: YYYY-MM (ej: 2026-07).',
          });
          return;
        }
        const _exhaustive: never = error;
        void _exhaustive;
        res.status(500).json({ message: 'Error inesperado' });
        return;
      }

      res.status(200).json(aMovimientosMesDto(result.getValue()));
    } catch (err) {
      next(err);
    }
  });
}

/**
 * registrarMovimientoManual — sibling handler for POST /api/movimientos (US-058, D-12).
 *
 * Registers a single manually-typed movement (no cartola/file). Validates the
 * request body shape with a Zod discriminated union on `tipo` (transport layer only —
 * layer-honesty gate). Business rules (fecha ≤ today, money positivity/overflow,
 * categoriaId catalog membership) stay in the domain and use case.
 *
 * Error mapping (exhaustive `never` guard, D-09):
 *   - MovimientoManualInvalidoError  → 400 (scrubbed — no amounts in message)
 *   - CategoriaFueraDeCatalogoError  → 400 (scrubbed)
 *   - BucketCategoriaNoConcuerdaError → 400 (scrubbed)
 *   - PersistenciaFallidaError        → 500
 *
 * Success: 201 Created + RegistrarMovimientoManualResponseDto (D-12).
 * userId: from req.userId (session middleware — never from the body, ISO-01).
 */
export function registrarMovimientoManual(
  router: Router,
  useCase: RegistrarMovimientoManualUseCase,
): void {
  router.post('/movimientos', async (req, res, next) => {
    try {
      // Transport shape validation only — Zod discriminated union on `tipo`.
      // Amounts, fecha business rules, and catalog membership are NOT validated here.
      const parsed = registrarMovimientoManualSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: 'Cuerpo de la petición inválido.' });
        return;
      }

      const body = parsed.data;

      // Build the use case command. The discriminated union on `tipo` ensures
      // the Gasto variant always carries bucket+categoriaId at the type level.
      const fecha = new Date(body.fecha);

      const command =
        body.tipo === 'Ingreso'
          ? ({
              userId: req.userId!,
              tipo: 'Ingreso' as const,
              fecha,
              descripcion: body.descripcion,
              monto: body.monto,
            } satisfies Parameters<typeof useCase.execute>[0])
          : ({
              userId: req.userId!,
              tipo: 'Gasto' as const,
              fecha,
              descripcion: body.descripcion,
              monto: body.monto,
              bucket: body.bucket as
                | Bucket.Necesidades
                | Bucket.Deseos
                | Bucket.Ahorro,
              categoriaId: body.categoriaId,
            } satisfies Parameters<typeof useCase.execute>[0]);

      const result = await useCase.execute(command);

      if (result.isFail()) {
        const error = result.getError();

        if (error instanceof MovimientoManualInvalidoError) {
          res.status(400).json({ message: error.message });
          return;
        }
        if (error instanceof CategoriaFueraDeCatalogoError) {
          res.status(400).json({ message: error.message });
          return;
        }
        if (error instanceof BucketCategoriaNoConcuerdaError) {
          res.status(400).json({ message: error.message });
          return;
        }
        if (error instanceof PersistenciaFallidaError) {
          res.status(500).json({ message: 'Error de infraestructura.' });
          return;
        }

        // Exhaustive never guard (D-09) — compile-time guarantee that every
        // error variant in RegistrarMovimientoManualError is handled above.
        const _exhaustive: never = error;
        void _exhaustive;
        res.status(500).json({ message: 'Error inesperado.' });
        return;
      }

      const { id, vo } = result.getValue();

      // Build response DTO from the in-memory VO — no DB read-back (D-08).
      // NOTE: the 201 response reflects the Zod-parsed request values for categoriaId
      // and bucket. This is safe only because the use case is validate-only on those
      // fields (D-11 resolves them identically to the request). If the use case ever
      // transforms categoriaId or bucket, the response must switch to use-case output.
      const categoriaId = body.tipo === 'Gasto' ? body.categoriaId : null;
      const bucket = body.tipo === 'Gasto' ? body.bucket : 'Ingreso';

      res
        .status(201)
        .json(
          aRegistrarMovimientoManualResponseDto(vo, id, categoriaId, bucket),
        );
    } catch (err) {
      next(err);
    }
  });
}

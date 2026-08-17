import type { Router } from 'express';
import { ObtenerDetalleBucketUseCase } from '../../../application/use-cases/obtener-detalle-bucket.use-case';
import { ObtenerDetalleBucketMesUseCase } from '../../../application/use-cases/obtener-detalle-bucket-mes.use-case';
import { BucketInvalidoError } from '../../../domain/errors/bucket-invalido.error';
import { PeriodoInvalidoError } from '../../../domain/errors/periodo-invalido.error';
import { aDetalleBucketDto } from '../../http/dto/detalle-bucket.dto';
import { aDetalleBucketMesDto } from '../../http/dto/detalle-bucket-mes.dto';
import { bucketsQuerySchema } from '../schemas/buckets.schema';
import { bucketDetalleMesQuerySchema } from '../schemas/bucket-detalle-mes.schema';

/**
 * registrarBuckets — port del DetalleBucketController (ADR-028).
 *
 * GET /api/buckets/:bucket?periodo=YYYY-MM → drill-down de un bucket (US-017).
 *
 * El `:bucket` crudo se valida dentro del use case contra el enum Bucket; un
 * valor no reconocido → `BucketInvalidoError` → 400 scrubbeado (jamás refleja el
 * input crudo en la respuesta). `userId` viene del session middleware.
 */
export function registrarBuckets(
  router: Router,
  obtenerDetalleBucket: ObtenerDetalleBucketUseCase,
): void {
  router.get('/buckets/:bucket', async (req, res, next) => {
    try {
      // Boundary schema validates TRANSPORT SHAPE ONLY (openapi-contract-express
      // design, layer-honesty gate) — it does NOT know the YYYY-MM format rule
      // nor the valid-bucket enum, both stay domain concerns handled below.
      const parsedQuery = bucketsQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) {
        res.status(400).json({
          message: 'Parámetros de consulta inválidos.',
        });
        return;
      }

      const result = await obtenerDetalleBucket.execute({
        userId: req.userId!, // garantizado por el session middleware previo
        bucket: req.params.bucket,
        periodo: parsedQuery.data.periodo,
      });

      if (result.isFail()) {
        const error = result.getError();
        if (error instanceof BucketInvalidoError) {
          res.status(400).json({
            message:
              'El bucket no es válido. Valores esperados: Necesidades, Deseos, Ahorro, Ingreso, SinCategoria.',
          });
          return;
        }
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

      res.status(200).json(aDetalleBucketDto(result.getValue()));
    } catch (err) {
      next(err);
    }
  });
}

/**
 * registrarBucketDetalleMes — port del use case US-051 a handler Express.
 *
 * GET /api/buckets/:bucket/detalle?periodo=YYYY-MM → detalle MES-BUCKET
 * agrupado por categoría (US-051). Ruta hermana aditiva del flat
 * `/api/buckets/:bucket` (US-017): ambos conviven hasta que US-053 retire el
 * drill-down interino.
 *
 * Misma disciplina del flat (D-07): el `:bucket` crudo y el `periodo` se
 * validan dentro del use case (`BucketInvalidoError` sobre la allowlist de 4
 * buckets de gasto D-08, `PeriodoInvalidoError` MBD-04) → 400 scrubbeado que
 * jamás refleja el input crudo. El mensaje de bucket lista la allowlist de
 * CUATRO valores (D-07 — única divergencia con el mensaje de 5 del flat, que
 * incluye Ingreso). `userId` viene del session middleware. Inesperado →
 * `next(err)` → 500 vía error middleware.
 */
export function registrarBucketDetalleMes(
  router: Router,
  obtenerDetalleBucketMes: ObtenerDetalleBucketMesUseCase,
): void {
  router.get('/buckets/:bucket/detalle', async (req, res, next) => {
    try {
      // Boundary schema validates TRANSPORT SHAPE ONLY (openapi-contract-express
      // design, layer-honesty gate) — it does NOT know the YYYY-MM format rule
      // nor the valid-bucket enum, both stay domain concerns handled below.
      const parsedQuery = bucketDetalleMesQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) {
        res.status(400).json({
          message: 'Parámetros de consulta inválidos.',
        });
        return;
      }

      const result = await obtenerDetalleBucketMes.execute({
        userId: req.userId!, // garantizado por el session middleware previo
        bucket: req.params.bucket,
        periodo: parsedQuery.data.periodo,
      });

      if (result.isFail()) {
        const error = result.getError();
        if (error instanceof BucketInvalidoError) {
          res.status(400).json({
            message:
              'El bucket no es válido. Valores esperados: Necesidades, Deseos, Ahorro, SinCategoria.',
          });
          return;
        }
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

      res.status(200).json(aDetalleBucketMesDto(result.getValue()));
    } catch (err) {
      next(err);
    }
  });
}

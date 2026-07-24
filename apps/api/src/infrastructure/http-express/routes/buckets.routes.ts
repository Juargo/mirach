import type { Router } from 'express';
import { ObtenerDetalleBucketUseCase } from '../../../application/use-cases/obtener-detalle-bucket.use-case';
import { BucketInvalidoError } from '../../../domain/errors/bucket-invalido.error';
import { PeriodoInvalidoError } from '../../../domain/errors/periodo-invalido.error';
import { aDetalleBucketDto } from '../../http/dto/detalle-bucket.dto';

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
      const result = await obtenerDetalleBucket.execute({
        userId: req.userId!, // garantizado por el session middleware previo
        bucket: req.params.bucket,
        periodo: queryString(req.query.periodo),
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
            message: 'El período no es válido. Formato esperado: YYYY-MM (ej: 2026-07).',
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

/** Express puede entregar string[] si el query se repite — normaliza a string|undefined. */
function queryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

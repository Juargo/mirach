import type { Router } from 'express';
import { ObtenerIngresosMesUseCase } from '../../../application/use-cases/obtener-ingresos-mes.use-case';
import { PeriodoInvalidoError } from '../../../domain/errors/periodo-invalido.error';
import { aIngresosMesDto } from '../../http/dto/ingresos-mes.dto';
import { ingresosMesQuerySchema } from '../schemas/ingresos-mes.schema';

/**
 * registrarIngresosMes — port del use case US-052 a handler Express.
 *
 * GET /api/ingresos/mes?periodo=YYYY-MM → detalle MES-INGRESOS por origen
 * (banco/Manual). Ruta TOP-LEVEL (NO sub-recurso de buckets — design D-06):
 * `GET /api/buckets/Ingresos/detalle` sigue rechazando Ingresos con su propio
 * 400 scrubeado (MBD-07, US-051) y queda intocada.
 *
 * Misma disciplina flat que `registrarBucketDetalleMes` (US-051 D-07): el
 * schema de borde valida SOLO la forma de transporte (`periodo` cualquier
 * string opcional); el formato YYYY-MM es regla de dominio vía `PeriodoMes`
 * → `PeriodoInvalidoError` (MID-04) → 400 scrubbeado que JAMÁS refleja el
 * input crudo. `userId` viene del session middleware (MID-06). Inesperado →
 * `next(err)` → 500 vía error middleware. Respuesta 200 vía `aIngresosMesDto`
 * (BigInt-safe, exactamente {total, conteo, transacciones}, MID-01/03/05).
 */
export function registrarIngresosMes(
  router: Router,
  obtenerIngresosMes: ObtenerIngresosMesUseCase,
): void {
  router.get('/ingresos/mes', async (req, res, next) => {
    try {
      // Boundary schema validates TRANSPORT SHAPE ONLY (openapi-contract-express
      // design, layer-honesty gate) — it does NOT know the YYYY-MM format rule,
      // which stays a domain concern (`PeriodoMes`, MID-04) handled below.
      const parsedQuery = ingresosMesQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) {
        res.status(400).json({
          message: 'Parámetros de consulta inválidos.',
        });
        return;
      }

      const result = await obtenerIngresosMes.execute({
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

      res.status(200).json(aIngresosMesDto(result.getValue()));
    } catch (err) {
      next(err);
    }
  });
}

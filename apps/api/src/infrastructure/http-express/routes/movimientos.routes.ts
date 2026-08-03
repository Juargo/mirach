import type { Router } from 'express';
import { ObtenerMovimientosMesUseCase } from '../../../application/use-cases/obtener-movimientos-mes.use-case';
import { PeriodoInvalidoError } from '../../../domain/errors/periodo-invalido.error';
import { aMovimientosMesDto } from '../../http/dto/movimiento-mes.dto';
import { movimientosQuerySchema } from '../schemas/movimientos.schema';

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

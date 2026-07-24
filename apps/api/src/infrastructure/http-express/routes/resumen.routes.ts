import type { Router } from 'express';
import { CalcularResumenMesUseCase } from '../../../application/use-cases/calcular-resumen-mes.use-case';
import { CalcularResumenAnualUseCase } from '../../../application/use-cases/calcular-resumen-anual.use-case';
import { PeriodoInvalidoError } from '../../../domain/errors/periodo-invalido.error';
import { AnioInvalidoError } from '../../../domain/errors/anio-invalido.error';
import { ResumenAnualInvalidoError } from '../../../domain/errors/resumen-anual-invalido.error';
import { aResumenMesDto } from '../../http/dto/resumen-mes.dto';
import { aResumenAnualDto } from '../../http/dto/resumen-anual.dto';

/**
 * registrarResumen — port del ResumenController a handlers Express (ADR-028).
 *
 * GET /api/resumen?periodo=YYYY-MM        → 50/30/20 mensual (US-015/016)
 * GET /api/resumen/anual?anio=YYYY        → 50/30/20 anual (US-030)
 *
 * closure-DI: recibe los use cases del container. El `userId` lo pone el
 * session middleware en `req.userId` (aislamiento por usuario, RNF-SEC-006).
 * Traducción Result<T,E> → HTTP idéntica al controller: 400 scrubbeado (jamás
 * refleja el input crudo), unexpected → `next(err)` → 500 vía error middleware.
 */
export function registrarResumen(
  router: Router,
  calcularResumenMes: CalcularResumenMesUseCase,
  calcularResumenAnual: CalcularResumenAnualUseCase,
): void {
  router.get('/resumen', async (req, res, next) => {
    try {
      const result = await calcularResumenMes.execute({
        userId: req.userId!, // garantizado por el session middleware previo
        periodo: queryString(req.query.periodo),
      });

      if (result.isFail()) {
        const error = result.getError();
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

      const { periodo, resumen } = result.getValue();
      res.status(200).json(aResumenMesDto(periodo, resumen));
    } catch (err) {
      next(err);
    }
  });

  router.get('/resumen/anual', async (req, res, next) => {
    try {
      const result = await calcularResumenAnual.execute({
        userId: req.userId!,
        anio: queryString(req.query.anio),
      });

      if (result.isFail()) {
        const error = result.getError();
        if (error instanceof AnioInvalidoError) {
          res.status(400).json({
            message: 'El año no es válido. Debe ser un entero entre 2000 y 2100.',
          });
          return;
        }
        if (error instanceof ResumenAnualInvalidoError) {
          // Violación de invariante (no un problema de input): 500, log server-side.
          console.error(
            'Invariante de ResumenAnual violada al ensamblar el resumen anual',
            error.stack,
          );
          res.status(500).json({
            message: 'Error inesperado al calcular el resumen anual. Intenta nuevamente.',
          });
          return;
        }
        const _exhaustive: never = error;
        void _exhaustive;
        res.status(500).json({ message: 'Error inesperado' });
        return;
      }

      const { resumenAnual } = result.getValue();
      res.status(200).json(aResumenAnualDto(resumenAnual));
    } catch (err) {
      next(err);
    }
  });
}

/** Express puede entregar string[] si el query se repite — normaliza a string|undefined. */
function queryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

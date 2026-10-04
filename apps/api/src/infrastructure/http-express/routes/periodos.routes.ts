import type { Router } from 'express';
import { ListarPeriodosConDatosUseCase } from '../../../application/use-cases/listar-periodos-con-datos.use-case';

/**
 * registrarPeriodos — GET /api/periodos → `{ periodos: ['2026-07', ...] }`.
 *
 * Months (`YYYY-MM`) in which the session user has at least one movement,
 * most recent first, no duplicates. Top-level Spanish noun path, like
 * `/resumen`, `/buckets`, `/ingresos`, `/movimientos`. No query parameters.
 * `userId` comes from the session middleware (RNF-SEC-006); an unexpected
 * failure goes to `next(err)` → 500 via the error middleware.
 */
export function registrarPeriodos(
  router: Router,
  listarPeriodosConDatos: ListarPeriodosConDatosUseCase,
): void {
  router.get('/periodos', async (req, res, next) => {
    try {
      const periodos = await listarPeriodosConDatos.execute({
        userId: req.userId!, // garantizado por el session middleware previo
      });
      res.status(200).json({ periodos });
    } catch (err) {
      next(err);
    }
  });
}

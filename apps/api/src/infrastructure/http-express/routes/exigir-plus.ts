import type { RequestHandler, Response } from 'express';
import type { VerificarPlusUseCase } from '../../../application/use-cases/verificar-plus.use-case';
import { PlanPlusRequeridoError } from '../../../domain/errors/plan-plus-requerido.error';
import { responderErrorTraducido } from './responder-error-traducido';

export const PLAN_PLUS_REQUERIDO = 'PLAN_PLUS_REQUERIDO';

/** 403 `PLAN_PLUS_REQUERIDO`: the one response of every Plus-only function. */
export function responderPlanPlusRequerido(
  res: Response,
  error: PlanPlusRequeridoError = new PlanPlusRequeridoError(),
): void {
  responderErrorTraducido(res, {
    status: 403,
    code: PLAN_PLUS_REQUERIDO,
    message: error.message,
  });
}

/**
 * crearExigirPlus — middleware for a route that is Plus-only as a whole
 * (PLA-01). It runs after the session middleware and before the handler, so a
 * free account is answered before the body is validated or anything is read.
 * A failure of the check goes to `next` and ends in 500: it never lets the
 * request through.
 */
export function crearExigirPlus(
  verificarPlus: VerificarPlusUseCase,
): RequestHandler {
  return async (req, res, next) => {
    try {
      const result = await verificarPlus.execute({ userId: req.userId! });
      if (result.isFail()) {
        responderPlanPlusRequerido(res, result.getError());
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

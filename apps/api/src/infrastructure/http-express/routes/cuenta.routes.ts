import type { Router } from 'express';
import type { EliminarCuentaUseCase } from '../../../application/use-cases/eliminar-cuenta.use-case';
import { ConfirmacionEliminacionInvalidaError } from '../../../domain/errors/confirmacion-eliminacion-invalida.error';
import { clearSessionCookie } from '../../http/auth/cookie';
import { cuentaDeleteRequestSchema } from '../schemas/cuenta.schema';

const CONFIRMACION_INVALIDA = {
  message: new ConfirmacionEliminacionInvalidaError().message,
  code: 'CONFIRMACION_INVALIDA',
};

export interface CuentaRoutesDeps {
  readonly eliminarCuenta: EliminarCuentaUseCase;
  /** Atributo Secure de la cookie de sesión (ADR-029), derivado en app.ts. */
  readonly cookieSecure: boolean;
}

/**
 * registrarCuenta — `DELETE /api/cuenta`: elimina la cuenta de la sesión y
 * todos sus datos. Monta en el router protegido (sin sesión → 401 del
 * middleware; repetir con una sesión ya borrada también da 401).
 *
 * `req.userId!` siempre sale de la sesión, nunca del body. Éxito: 204 y se
 * limpia la cookie (inocuo para clientes Bearer). Un body ausente, inválido
 * o con una confirmación distinta de "ELIMINAR" → 400 `CONFIRMACION_INVALIDA`
 * sin borrar nada.
 */
export function registrarCuenta(router: Router, deps: CuentaRoutesDeps): void {
  router.delete('/cuenta', async (req, res, next) => {
    try {
      const parsed = cuentaDeleteRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json(CONFIRMACION_INVALIDA);
        return;
      }

      const result = await deps.eliminarCuenta.execute({
        userId: req.userId!,
        confirmacion: parsed.data.confirmacion,
      });

      if (result.isFail()) {
        res.status(400).json({
          message: result.getError().message,
          code: 'CONFIRMACION_INVALIDA',
        });
        return;
      }

      res.setHeader('Set-Cookie', clearSessionCookie(deps.cookieSecure));
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });
}

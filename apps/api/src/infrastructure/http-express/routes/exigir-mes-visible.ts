import type { Request, RequestHandler } from 'express';
import { Result } from '../../../shared/result';
import type { PlanPlusRequeridoError } from '../../../domain/errors/plan-plus-requerido.error';
import type { VentanaPlanGratis } from '../../../application/use-cases/ventana-plan-gratis';
import { responderPlanPlusRequerido } from './exigir-plus';

type Verificacion = Promise<Result<void, PlanPlusRequeridoError>>;

const texto = (valor: unknown): string | undefined =>
  typeof valor === 'string' ? valor : undefined;

/**
 * crearExigirMesVisible — the middleware of the free plan window (S14). Each
 * one reads the month a request asks for and lets `VentanaPlanGratis` decide;
 * a month before the window is `403 PLAN_PLUS_REQUERIDO`, like every Plus-only
 * function. It runs after the session middleware and before the handler, so a
 * value the handler would reject (a malformed or repeated parameter) goes on
 * to its usual 400. A failure of the check goes to `next` and ends in 500: it
 * never lets the request through.
 */
export function crearExigirMesVisible(ventana: VentanaPlanGratis) {
  const exigir =
    (
      verificar: (req: Request, userId: string) => Verificacion,
    ): RequestHandler =>
    async (req, res, next) => {
      try {
        const result = await verificar(req, req.userId!);
        if (result.isFail()) {
          responderPlanPlusRequerido(res, result.getError());
          return;
        }
        next();
      } catch (err) {
        next(err);
      }
    };

  return {
    /** `?periodo=YYYY-MM` of a monthly read. */
    periodoEnQuery: exigir((req, userId) =>
      ventana.verificarPeriodo(userId, texto(req.query.periodo)),
    ),
    /** `aplicarAParecidos.periodo` of `PATCH /api/transacciones/:id/categoria`. */
    periodoEnAplicarAParecidos: exigir((req, userId) => {
      const aplicar = (
        req.body as { aplicarAParecidos?: { periodo?: unknown } }
      )?.aplicarAParecidos;
      return ventana.verificarPeriodo(userId, texto(aplicar?.periodo));
    }),
    /** `fecha` of `POST /api/movimientos`. */
    fechaEnBody: exigir((req, userId) => {
      const body = req.body as { fecha?: unknown; tipo?: unknown } | undefined;
      const fecha = texto(body?.fecha);
      return fecha === undefined
        ? Promise.resolve(Result.ok(undefined))
        : ventana.verificarFecha(
            userId,
            new Date(fecha),
            body?.tipo === 'Ingreso',
          );
    }),
  };
}

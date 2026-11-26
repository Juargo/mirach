import type { Router } from 'express';
import type { z } from 'zod';
import type { ObtenerPlanUseCase } from '../../../application/use-cases/obtener-plan.use-case';
import type { planResponseSchema } from '../schemas/plan.schema';

type PlanResponse = z.infer<typeof planResponseSchema>;

/**
 * registrarPlan — `GET /api/plan` (ADR-012 §2, ADR-015 §2): whether the session
 * user has Plus and where it comes from. `userId` comes from the session
 * middleware (RNF-SEC-006); an unexpected failure goes to `next(err)`.
 */
export function registrarPlan(
  router: Router,
  obtenerPlan: ObtenerPlanUseCase,
): void {
  router.get('/plan', async (req, res, next) => {
    try {
      const plan = await obtenerPlan.execute({ userId: req.userId! });
      const body: PlanResponse = {
        plan: plan.plan,
        origen: plan.origen,
        venceEn: plan.venceEn?.toISOString() ?? null,
        renueva: plan.renueva,
        producto: plan.producto,
        tienda: plan.tienda,
        prueba:
          plan.prueba === null
            ? null
            : {
                venceEn: plan.prueba.venceEn.toISOString(),
                vigente: plan.prueba.vigente,
                avisoDiasRestantes: plan.prueba.avisoDiasRestantes,
              },
      };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  });
}

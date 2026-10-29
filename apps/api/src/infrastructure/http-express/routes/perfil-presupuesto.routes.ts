import type { Router } from 'express';
import type {
  ActualizarPerfilPresupuestoError,
  ActualizarPerfilPresupuestoUseCase,
  ObtenerPerfilPresupuestoUseCase,
} from '../../../application/use-cases/perfil-presupuesto.use-case';
import { Bucket } from '../../../domain/value-objects/bucket';
import { PerfilPresupuesto } from '../../../domain/value-objects/perfil-presupuesto';
import { PerfilNoSuma100Error } from '../../../domain/errors/perfil-no-suma-100.error';
import { MetaPresupuestoInvalidaError } from '../../../domain/errors/meta-presupuesto-invalida.error';
import { perfilPresupuestoUpdateRequestSchema } from '../schemas/perfil-presupuesto.schema';
import { responderErrorTraducido } from './responder-error-traducido';

const BODY_INVALIDO = {
  message: 'Cuerpo de la petición inválido.',
  code: 'BODY_INVALIDO',
};

/** Dependencies of `/api/perfil/presupuesto` (#110). */
export interface PerfilPresupuestoGraph {
  readonly obtener: ObtenerPerfilPresupuestoUseCase;
  readonly actualizar: ActualizarPerfilPresupuestoUseCase;
}

/** One error class ⇒ one status ⇒ one `code`; the `never` guard keeps it exhaustive. */
export function aPerfilPresupuestoHttpError(
  error: ActualizarPerfilPresupuestoError,
): { status: number; code: string; message: string } {
  if (error instanceof PerfilNoSuma100Error) {
    return { status: 400, code: 'PERFIL_NO_SUMA_100', message: error.message };
  }
  if (error instanceof MetaPresupuestoInvalidaError) {
    return { status: 400, code: 'META_INVALIDA', message: error.message };
  }
  const _exhaustive: never = error;
  return _exhaustive;
}

function aDto(perfil: PerfilPresupuesto) {
  return {
    perfil: perfil.perfil,
    metas: {
      Necesidades: Number(perfil.metas[Bucket.Necesidades]),
      Deseos: Number(perfil.metas[Bucket.Deseos]),
      Ahorro: Number(perfil.metas[Bucket.Ahorro]),
    },
  };
}

/**
 * registrarPerfilPresupuesto — `GET/PUT /api/perfil/presupuesto` (#110,
 * ADR-005 §7). `req.userId!` always comes from the session, never from the
 * body (the schema is `.strict()`). A failed parse never echoes the body.
 */
export function registrarPerfilPresupuesto(
  router: Router,
  graph: PerfilPresupuestoGraph,
): void {
  router.get('/perfil/presupuesto', async (req, res, next) => {
    try {
      const result = await graph.obtener.execute({ userId: req.userId! });
      res.status(200).json(aDto(result.getValue()));
    } catch (err) {
      next(err);
    }
  });

  router.put('/perfil/presupuesto', async (req, res, next) => {
    try {
      const parsed = perfilPresupuestoUpdateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(BODY_INVALIDO);
        return;
      }

      const body = parsed.data;
      const result = await graph.actualizar.execute(
        body.perfil === 'personalizado'
          ? {
              userId: req.userId!,
              perfil: body.perfil,
              metas: {
                [Bucket.Necesidades]: BigInt(body.metas.Necesidades),
                [Bucket.Deseos]: BigInt(body.metas.Deseos),
                [Bucket.Ahorro]: BigInt(body.metas.Ahorro),
              },
            }
          : { userId: req.userId!, perfil: body.perfil },
      );

      if (result.isFail()) {
        responderErrorTraducido(
          res,
          aPerfilPresupuestoHttpError(result.getError()),
        );
        return;
      }

      res.status(200).json(aDto(result.getValue()));
    } catch (err) {
      next(err);
    }
  });
}

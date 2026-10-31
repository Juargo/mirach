import type { Router } from 'express';
import type {
  AceptarConsentimientoUseCase,
  ListarConsentimientosUseCase,
  RevocarConsentimientoUseCase,
} from '../../../application/use-cases/consentimientos.use-case';
import type {
  Consentimiento,
  TipoConsentimiento,
} from '../../../domain/value-objects/consentimiento';
import {
  consentimientoParamsSchema,
  consentimientoRequestSchema,
} from '../schemas/consentimientos.schema';
import { responderErrorTraducido } from './responder-error-traducido';

const BODY_INVALIDO = {
  message: 'Cuerpo de la petición inválido.',
  code: 'BODY_INVALIDO',
};

const TIPO_INVALIDO = {
  message: 'El tipo de consentimiento no es válido.',
  code: 'TIPO_CONSENTIMIENTO_INVALIDO',
};

/** Dependencies of `/api/consentimientos` (#112). */
export interface ConsentimientosGraph {
  readonly listar: ListarConsentimientosUseCase;
  readonly aceptar: AceptarConsentimientoUseCase;
  readonly revocar: RevocarConsentimientoUseCase;
}

function aDto(consentimiento: Consentimiento) {
  return {
    tipo: consentimiento.tipo,
    version: consentimiento.version,
    aceptadoEn: consentimiento.aceptadoEn.toISOString(),
    revocadoEn: consentimiento.revocadoEn?.toISOString() ?? null,
  };
}

/**
 * registrarConsentimientos — `GET/POST /api/consentimientos` and
 * `DELETE /api/consentimientos/:tipo` (#112, ADR-005 §7). `req.userId!` always
 * comes from the session, never from the body (the schema is `.strict()`). A
 * failed parse never echoes the body.
 */
export function registrarConsentimientos(
  router: Router,
  graph: ConsentimientosGraph,
): void {
  router.get('/consentimientos', async (req, res, next) => {
    try {
      const result = await graph.listar.execute({ userId: req.userId! });
      res.status(200).json({ consentimientos: result.getValue().map(aDto) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/consentimientos', async (req, res, next) => {
    try {
      const parsed = consentimientoRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(BODY_INVALIDO);
        return;
      }

      const result = await graph.aceptar.execute({
        userId: req.userId!,
        tipo: parsed.data.tipo as TipoConsentimiento,
        version: parsed.data.version,
      });

      if (result.isFail()) {
        responderErrorTraducido(res, {
          status: 400,
          code: 'VERSION_CONSENTIMIENTO_INVALIDA',
          message: result.getError().message,
        });
        return;
      }

      res.status(201).json(aDto(result.getValue()));
    } catch (err) {
      next(err);
    }
  });

  router.delete('/consentimientos/:tipo', async (req, res, next) => {
    try {
      const parsed = consentimientoParamsSchema.safeParse(req.params);
      if (!parsed.success) {
        res.status(400).json(TIPO_INVALIDO);
        return;
      }

      await graph.revocar.execute({
        userId: req.userId!,
        tipo: parsed.data.tipo as TipoConsentimiento,
      });

      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });
}

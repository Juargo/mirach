import type { Router } from 'express';
import type { CatalogoGraph } from '../../../composition/crear-catalogo';
import {
  patronCreateRequestSchema,
  patronUpdateRequestSchema,
  patronIdPathParamsSchema,
} from '../schemas/patrones.schema';
import { aPatronDto } from '../../http/dto/patron.dto';
import { aCatalogoHttpError } from './catalogo-http-error';
import { responderErrorTraducido } from './responder-error-traducido';

const BODY_INVALIDO = {
  message: 'Cuerpo de la petición inválido.',
  code: 'BODY_INVALIDO',
};

/**
 * registrarPatrones — port de `/api/patrones` (US-038, CAT038-05/06/07).
 *
 * Mismas convenciones que `registrarCategorias`: `.safeParse()` a la
 * entrada (D-09), `aCatalogoHttpError` compartido para la traducción de
 * errores.
 *
 * Toda respuesta de error pasa por `responderErrorTraducido` (issue #507).
 */
export function registrarPatrones(
  router: Router,
  catalogo: CatalogoGraph,
): void {
  router.post('/patrones', async (req, res, next) => {
    try {
      const parsed = patronCreateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(BODY_INVALIDO);
        return;
      }

      const result = await catalogo.crearPatron.execute({
        userId: req.userId!,
        categoriaId: parsed.data.categoriaId,
        patron: parsed.data.patron,
        matchType: parsed.data.matchType,
        prioridad: parsed.data.prioridad,
      });

      if (result.isFail()) {
        responderErrorTraducido(res, aCatalogoHttpError(result.getError()));
        return;
      }

      res.status(201).json(aPatronDto(result.getValue()));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/patrones/:id', async (req, res, next) => {
    try {
      const parsedParams = patronIdPathParamsSchema.safeParse(req.params);
      const parsedBody = patronUpdateRequestSchema.safeParse(req.body);
      if (!parsedParams.success || !parsedBody.success) {
        res.status(400).json(BODY_INVALIDO);
        return;
      }

      const result = await catalogo.actualizarPatron.execute({
        userId: req.userId!,
        id: parsedParams.data.id,
        patron: parsedBody.data.patron,
        matchType: parsedBody.data.matchType,
        prioridad: parsedBody.data.prioridad,
      });

      if (result.isFail()) {
        responderErrorTraducido(res, aCatalogoHttpError(result.getError()));
        return;
      }

      res.status(200).json(aPatronDto(result.getValue()));
    } catch (err) {
      next(err);
    }
  });

  router.delete('/patrones/:id', async (req, res, next) => {
    try {
      const parsedParams = patronIdPathParamsSchema.safeParse(req.params);
      if (!parsedParams.success) {
        res.status(400).json(BODY_INVALIDO);
        return;
      }

      const result = await catalogo.eliminarPatron.execute({
        userId: req.userId!,
        id: parsedParams.data.id,
      });

      if (result.isFail()) {
        responderErrorTraducido(res, aCatalogoHttpError(result.getError()));
        return;
      }

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });
}

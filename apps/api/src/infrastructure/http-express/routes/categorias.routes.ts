import type { Router } from 'express';
import type { CatalogoGraph } from '../../../composition/crear-catalogo';
import {
  categoriaCreateRequestSchema,
  categoriaUpdateRequestSchema,
  categoriaIdPathParamsSchema,
} from '../schemas/categorias.schema';
import { aCatalogoDto } from '../../http/dto/catalogo.dto';
import { aCategoriaDto } from '../../http/dto/categoria.dto';
import { aCatalogoHttpError } from './catalogo-http-error';
import { esDemoDeSesion } from '../../http/auth/es-demo-de-sesion';
import { responderErrorTraducido } from './responder-error-traducido';

const BODY_INVALIDO = {
  message: 'Cuerpo de la petición inválido.',
  code: 'BODY_INVALIDO',
};

/**
 * registrarCategorias — port de `/api/categorias` (US-038, CAT038-01…04/07).
 *
 * Rutas NUEVAS: validan a la entrada con `.safeParse()` (D-09) — a
 * diferencia de las rutas legacy, que quedan contract-only. Un fallo de
 * `.safeParse()` NUNCA ecoa el body ni la lista de issues de Zod (D-09,
 * convención de scrubbing). `esDemoDeSesion(req)` se hilvana en cada
 * mutación (CAT038-08); `userId` viene del session middleware.
 *
 * `esDemoDeSesion(req)` (issue #507) reemplaza el `req.esDemo!` original —
 * fail-closed en vez de non-null assertion. Toda respuesta de error pasa por
 * `responderErrorTraducido` (issue #507, R2-WARNING del fan-out 4R) —
 * chokepoint único que loguea `logDemoGateTrip` (ADR-033) cuando
 * `code === 'DEMO_SOLO_LECTURA'`.
 */
export function registrarCategorias(
  router: Router,
  catalogo: CatalogoGraph,
): void {
  router.get('/categorias', async (req, res, next) => {
    try {
      const result = await catalogo.listarCatalogo.execute({
        userId: req.userId!,
      });
      res.status(200).json(aCatalogoDto(result.getValue()));
    } catch (err) {
      next(err);
    }
  });

  router.post('/categorias', async (req, res, next) => {
    try {
      const parsed = categoriaCreateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(BODY_INVALIDO);
        return;
      }

      const result = await catalogo.crearCategoria.execute({
        userId: req.userId!,
        esDemo: esDemoDeSesion(req),
        nombre: parsed.data.nombre,
        bucket: parsed.data.bucket,
        patrones: parsed.data.patrones,
      });

      if (result.isFail()) {
        responderErrorTraducido(
          res,
          req,
          aCatalogoHttpError(result.getError()),
        );
        return;
      }

      res.status(201).json(aCategoriaDto(result.getValue()));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/categorias/:id', async (req, res, next) => {
    try {
      const parsedParams = categoriaIdPathParamsSchema.safeParse(req.params);
      const parsedBody = categoriaUpdateRequestSchema.safeParse(req.body);
      if (!parsedParams.success || !parsedBody.success) {
        res.status(400).json(BODY_INVALIDO);
        return;
      }

      const result = await catalogo.actualizarCategoria.execute({
        userId: req.userId!,
        esDemo: esDemoDeSesion(req),
        id: parsedParams.data.id,
        nombre: parsedBody.data.nombre,
        bucket: parsedBody.data.bucket,
      });

      if (result.isFail()) {
        responderErrorTraducido(
          res,
          req,
          aCatalogoHttpError(result.getError()),
        );
        return;
      }

      res.status(200).json(aCategoriaDto(result.getValue()));
    } catch (err) {
      next(err);
    }
  });

  router.delete('/categorias/:id', async (req, res, next) => {
    try {
      const parsedParams = categoriaIdPathParamsSchema.safeParse(req.params);
      if (!parsedParams.success) {
        res.status(400).json(BODY_INVALIDO);
        return;
      }

      const result = await catalogo.eliminarCategoria.execute({
        userId: req.userId!,
        esDemo: esDemoDeSesion(req),
        id: parsedParams.data.id,
      });

      if (result.isFail()) {
        responderErrorTraducido(
          res,
          req,
          aCatalogoHttpError(result.getError()),
        );
        return;
      }

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });
}

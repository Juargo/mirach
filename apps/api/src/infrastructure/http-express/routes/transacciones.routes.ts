import type { Router } from 'express';
import { ReclasificarTransaccionUseCase } from '../../../application/use-cases/reclasificar-transaccion.use-case';
import { ReevaluarCategoriasUseCase } from '../../../application/use-cases/reevaluar-categorias.use-case';
import { CategoriaDesconocidaError } from '../../../domain/errors/categoria-desconocida.error';
import { TransaccionNoEncontradaError } from '../../../domain/errors/transaccion-no-encontrada.error';
import { CategorizacionFallidaError } from '../../../domain/errors/categorizacion-fallida.error';
import {
  aReclasificarCategoriaDto,
  type ReclasificarCategoriaBodyDto,
} from '../../http/dto/reclasificar-categoria.dto';
import { aReevaluarCategoriasDto } from '../../http/dto/reevaluar-categorias.dto';
import { responderErrorTraducido } from './responder-error-traducido';
import { aCatalogoHttpError } from './catalogo-http-error';
import { aPatronExistenteDto } from '../../http/dto/patron.dto';
import {
  aplicarAParecidosSchema,
  transaccionesParecidosQuerySchema,
} from '../schemas/transacciones-categoria.schema';
import type { CatalogoGraph } from '../../../composition/crear-catalogo';

/** The learning use cases the transaction routes need (CLA-03, S6). */
export type AprendizajeTransacciones = Pick<
  CatalogoGraph,
  'obtenerParecidos' | 'reclasificarConParecidos'
>;

const BODY_INVALIDO = {
  message: 'Cuerpo de la petición inválido.',
  code: 'BODY_INVALIDO',
};
const MENSAJE_CATEGORIA_DESCONOCIDA =
  'La categoría indicada no existe en tu catálogo.';
const MENSAJE_TRANSACCION_NO_ENCONTRADA =
  'La transacción no existe o no pertenece al usuario autenticado.';

/**
 * registrarTransacciones — port del TransaccionesController (ADR-028).
 *
 * PATCH /api/transacciones/:id/categoria → reclasificación manual (US-013 S4).
 *
 * Primera escritura: valida el body a mano (sin class-validator, igual que el
 * login). `categoriaId` no-string/ausente → '' para que el writer lo rechace
 * de forma uniforme (nunca undefined ni un objeto crudo) — esto incluye el
 * body legacy `{ categoria: <nombre> }` (ADR-042, corte duro sin alias de
 * transición): al no traer `categoriaId`, coacciona a `''` igual que un
 * campo ausente.
 *
 * ADR-037: `CategoriaInvalidaError` (el gate del enum cerrado) fue retirado.
 * ADR-042: el contrato pasa de `nombre` a `categoriaId`.
 * `CategoriaDesconocidaError`     → 400, mensaje genérico que NO enumera el
 *   catálogo (un id que no resuelve contra el catálogo REAL del caller, o
 *   que no le pertenece).
 * TransaccionNoEncontradaError → 404 (funde no-existe y no-es-tuya: anti-enumeración).
 *
 * `aplicarAParecidos: { periodo }` (CLA-03, S6) — opcional. Presente, la
 * reclasificación, el patrón sugerido y el movimiento de los parecidos del
 * período ocurren en UNA transacción (`ReclasificarConParecidosUseCase`).
 * A diferencia de `categoriaId`, este campo SÍ se valida en el borde: un
 * valor malformado es 400 `BODY_INVALIDO`, nunca se ignora. Ausente, el
 * camino es el de siempre. La respuesta suma `movidos` (0 sin la opción).
 *
 * GET /api/transacciones/:id/parecidos?categoriaId=&periodo= → texto
 * sugerido y cuántos OTROS movimientos del período lo seguirían (S6).
 *
 * Toda respuesta de error pasa por `responderErrorTraducido`.
 */
export function registrarTransacciones(
  router: Router,
  reclasificarTransaccion: ReclasificarTransaccionUseCase,
  aprendizaje: AprendizajeTransacciones,
): void {
  router.get('/transacciones/:id/parecidos', async (req, res, next) => {
    try {
      const parsed = transaccionesParecidosQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({
          message: 'Parámetros de consulta inválidos.',
          code: 'PARAMETROS_INVALIDOS',
        });
        return;
      }

      const result = await aprendizaje.obtenerParecidos.execute({
        userId: req.userId!,
        transaccionId: req.params.id,
        categoriaId: parsed.data.categoriaId,
        periodo: parsed.data.periodo,
      });
      if (result.isFail()) {
        responderErrorTraducido(res, aCatalogoHttpError(result.getError()));
        return;
      }

      const { patron, total, existente } = result.getValue();
      res.status(200).json({
        patron,
        total,
        existente: existente === null ? null : aPatronExistenteDto(existente),
      });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/transacciones/:id/categoria', async (req, res, next) => {
    try {
      const rawAplicar: unknown = (
        req.body as ReclasificarCategoriaBodyDto | undefined
      )?.aplicarAParecidos;
      if (rawAplicar !== undefined) {
        const aplicar = aplicarAParecidosSchema.safeParse(rawAplicar);
        const rawId: unknown = (
          req.body as ReclasificarCategoriaBodyDto | undefined
        )?.categoriaId;
        if (!aplicar.success) {
          res.status(400).json(BODY_INVALIDO);
          return;
        }
        const resultado = await aprendizaje.reclasificarConParecidos.execute({
          userId: req.userId!,
          transaccionId: req.params.id,
          categoriaId: typeof rawId === 'string' ? rawId : '',
          periodo: aplicar.data.periodo,
        });
        if (resultado.isFail()) {
          const error = resultado.getError();
          // Same bodies as the plain PATCH where the errors overlap.
          if (error instanceof CategoriaDesconocidaError) {
            responderErrorTraducido(res, {
              status: 400,
              message: MENSAJE_CATEGORIA_DESCONOCIDA,
            });
            return;
          }
          if (error instanceof TransaccionNoEncontradaError) {
            responderErrorTraducido(res, {
              status: 404,
              message: MENSAJE_TRANSACCION_NO_ENCONTRADA,
            });
            return;
          }
          responderErrorTraducido(res, aCatalogoHttpError(error));
          return;
        }
        const r = resultado.getValue();
        res.status(200).json(aReclasificarCategoriaDto(r, r.movidos));
        return;
      }

      // El cast usa `ReclasificarCategoriaBodyDto` (la forma cruda que el
      // DTO ya documenta) en vez de repetir su shape inline: una sola
      // definición del body, no dos que pueden divergir en silencio.
      const rawCategoriaId: unknown = (
        req.body as ReclasificarCategoriaBodyDto | undefined
      )?.categoriaId;
      const categoriaId =
        typeof rawCategoriaId === 'string' ? rawCategoriaId : '';

      const result = await reclasificarTransaccion.execute({
        userId: req.userId!, // garantizado por el session middleware previo
        transaccionId: req.params.id,
        categoriaId,
      });

      if (result.isFail()) {
        const error = result.getError();
        if (error instanceof CategoriaDesconocidaError) {
          responderErrorTraducido(res, {
            status: 400,
            message: MENSAJE_CATEGORIA_DESCONOCIDA,
          });
          return;
        }
        if (error instanceof TransaccionNoEncontradaError) {
          responderErrorTraducido(res, {
            status: 404,
            message: MENSAJE_TRANSACCION_NO_ENCONTRADA,
          });
          return;
        }
        const _exhaustive: never = error;
        void _exhaustive;
        responderErrorTraducido(res, {
          status: 500,
          message: 'Error inesperado',
        });
        return;
      }

      res.status(200).json(aReclasificarCategoriaDto(result.getValue()));
    } catch (err) {
      next(err);
    }
  });
}

/**
 * registrarReevaluarCategorias — sibling handler para
 * `POST /api/transacciones/reevaluar` (D-12/T-19 sibling pattern, mismo
 * archivo que `registrarTransacciones` — ambos operan sobre `Transaccion`).
 *
 * Re-corre `CategorizarTransaccionUseCase` con el catálogo de patrones
 * ACTUAL del usuario sobre TODAS sus transacciones persistidas (categorizadas
 * o no, sin filtro de período). Sin body ni query params — el `userId` viene
 * del session middleware.
 *
 * Toda respuesta de error pasa por `responderErrorTraducido`.
 *
 * `CategorizacionFallidaError` (catálogo no disponible, o fallo al escribir
 * el lote de reasignaciones) → 500: a diferencia del pipeline de ingesta, acá
 * NO hay degradación best-effort — es una acción explícita del usuario, y sin
 * catálogo confiable no se puede garantizar que el resultado sea completo.
 */
export function registrarReevaluarCategorias(
  router: Router,
  reevaluarCategorias: ReevaluarCategoriasUseCase,
): void {
  router.post('/transacciones/reevaluar', async (req, res, next) => {
    try {
      const result = await reevaluarCategorias.execute({
        userId: req.userId!, // garantizado por el session middleware previo
      });

      if (result.isFail()) {
        const error = result.getError();
        if (error instanceof CategorizacionFallidaError) {
          responderErrorTraducido(res, {
            status: 500,
            message: error.message,
          });
          return;
        }
        const _exhaustive: never = error;
        void _exhaustive;
        responderErrorTraducido(res, {
          status: 500,
          message: 'Error inesperado',
        });
        return;
      }

      res.status(200).json(aReevaluarCategoriasDto(result.getValue()));
    } catch (err) {
      next(err);
    }
  });
}

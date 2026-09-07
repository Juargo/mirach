import type { Router } from 'express';
import { ReclasificarTransaccionUseCase } from '../../../application/use-cases/reclasificar-transaccion.use-case';
import { ReevaluarCategoriasUseCase } from '../../../application/use-cases/reevaluar-categorias.use-case';
import { CategoriaDesconocidaError } from '../../../domain/errors/categoria-desconocida.error';
import { TransaccionNoEncontradaError } from '../../../domain/errors/transaccion-no-encontrada.error';
import { ReevaluarDemoSoloLecturaError } from '../../../domain/errors/reevaluar-demo-solo-lectura.error';
import { CategorizacionFallidaError } from '../../../domain/errors/categorizacion-fallida.error';
import {
  aReclasificarCategoriaDto,
  type ReclasificarCategoriaBodyDto,
} from '../../http/dto/reclasificar-categoria.dto';
import { aReevaluarCategoriasDto } from '../../http/dto/reevaluar-categorias.dto';
import { esDemoDeSesion } from '../../http/auth/es-demo-de-sesion';
import { responderErrorTraducido } from './responder-error-traducido';

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
 */
export function registrarTransacciones(
  router: Router,
  reclasificarTransaccion: ReclasificarTransaccionUseCase,
): void {
  router.patch('/transacciones/:id/categoria', async (req, res, next) => {
    try {
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
          res.status(400).json({
            message: 'La categoría indicada no existe en tu catálogo.',
          });
          return;
        }
        if (error instanceof TransaccionNoEncontradaError) {
          res.status(404).json({
            message:
              'La transacción no existe o no pertenece al usuario autenticado.',
          });
          return;
        }
        const _exhaustive: never = error;
        void _exhaustive;
        res.status(500).json({ message: 'Error inesperado' });
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
 * Demo gate: mismo patrón que movimientos/categorías/patrones/ingesta
 * (`esDemoDeSesion(req)` fail-closed, issue #507) — una sesión demo rechaza
 * con 403 DEMO_SOLO_LECTURA ANTES de tocar el catálogo o las transacciones.
 * Toda respuesta de error pasa por `responderErrorTraducido` (chokepoint que
 * loguea `logDemoGateTrip` cuando `code === 'DEMO_SOLO_LECTURA'`).
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
        esDemo: esDemoDeSesion(req),
      });

      if (result.isFail()) {
        const error = result.getError();
        if (error instanceof ReevaluarDemoSoloLecturaError) {
          responderErrorTraducido(res, req, {
            status: 403,
            code: 'DEMO_SOLO_LECTURA',
            message: error.message,
          });
          return;
        }
        if (error instanceof CategorizacionFallidaError) {
          responderErrorTraducido(res, req, {
            status: 500,
            message: error.message,
          });
          return;
        }
        const _exhaustive: never = error;
        void _exhaustive;
        responderErrorTraducido(res, req, {
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

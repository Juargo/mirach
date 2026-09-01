import type { Router } from 'express';
import { ReclasificarTransaccionUseCase } from '../../../application/use-cases/reclasificar-transaccion.use-case';
import { CategoriaDesconocidaError } from '../../../domain/errors/categoria-desconocida.error';
import { TransaccionNoEncontradaError } from '../../../domain/errors/transaccion-no-encontrada.error';
import {
  aReclasificarCategoriaDto,
  type ReclasificarCategoriaBodyDto,
} from '../../http/dto/reclasificar-categoria.dto';

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

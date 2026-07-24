import type { Router } from 'express';
import { ReclasificarTransaccionUseCase } from '../../../application/use-cases/reclasificar-transaccion.use-case';
import { CategoriaInvalidaError } from '../../../domain/errors/categoria-invalida.error';
import { TransaccionNoEncontradaError } from '../../../domain/errors/transaccion-no-encontrada.error';
import { aReclasificarCategoriaDto } from '../../http/dto/reclasificar-categoria.dto';

/**
 * registrarTransacciones — port del TransaccionesController (ADR-028).
 *
 * PATCH /api/transacciones/:id/categoria → reclasificación manual (US-013 S4).
 *
 * Primera escritura: valida el body a mano (sin class-validator, igual que el
 * login). `categoria` no-string/ausente → '' para que el enum-check del use case
 * lo rechace de forma uniforme (nunca undefined ni un objeto crudo).
 *
 * CategoriaInvalidaError     → 400 scrubbeado (nunca refleja el input crudo).
 * TransaccionNoEncontradaError → 404 (funde no-existe y no-es-tuya: anti-enumeración).
 */
export function registrarTransacciones(
  router: Router,
  reclasificarTransaccion: ReclasificarTransaccionUseCase,
): void {
  router.patch('/transacciones/:id/categoria', async (req, res, next) => {
    try {
      const rawCategoria: unknown = (req.body as { categoria?: unknown } | undefined)?.categoria;
      const categoria = typeof rawCategoria === 'string' ? rawCategoria : '';

      const result = await reclasificarTransaccion.execute({
        userId: req.userId!, // garantizado por el session middleware previo
        transaccionId: req.params.id,
        categoria,
      });

      if (result.isFail()) {
        const error = result.getError();
        if (error instanceof CategoriaInvalidaError) {
          res.status(400).json({
            message:
              'La categoría no es válida. Valores esperados: Supermercado, Combustible, Farmacia, Salud, Transporte, Streaming, Delivery, Ahorro.',
          });
          return;
        }
        if (error instanceof TransaccionNoEncontradaError) {
          res.status(404).json({
            message: 'La transacción no existe o no pertenece al usuario autenticado.',
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

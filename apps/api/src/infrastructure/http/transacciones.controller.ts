import {
  Controller,
  Patch,
  Param,
  Body,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ReclasificarTransaccionUseCase } from '../../application/use-cases/reclasificar-transaccion.use-case';
import { CategoriaInvalidaError } from '../../domain/errors/categoria-invalida.error';
import { TransaccionNoEncontradaError } from '../../domain/errors/transaccion-no-encontrada.error';
import type { ReclasificarCategoriaBodyDto } from './dto/reclasificar-categoria.dto';
import { aReclasificarCategoriaDto } from './dto/reclasificar-categoria.dto';
import { CurrentUser } from './auth/current-user.decorator';

/**
 * TransaccionesController — endpoint de reclasificación manual (US-013 S4).
 *
 * PATCH /api/transacciones/:id/categoria
 *
 * Mirrors DetalleBucketController exactly:
 *   1. Extract path param `:id` + body `categoria` (raw, unknown type).
 *   2. Delegate to ReclasificarTransaccionUseCase with the authenticated userId.
 *   3. Translate Result<T,E> to HTTP response.
 *
 * categoria inválida     → CategoriaInvalidaError    → scrubbed 400 (raw input NEVER reflected).
 * tx no existe/no es tuya → TransaccionNoEncontradaError → 404 (merged — anti-enumeration).
 *
 * NOTE: Protected by the global ApiKeyGuard (shared API key, fail-closed) AND
 * SessionGuard (per-user session, ISO-01/02) — userId comes from the
 * authenticated session via @CurrentUser(), never from a fixed constant.
 */
@Controller('api/transacciones')
export class TransaccionesController {
  private readonly logger = new Logger(TransaccionesController.name);

  constructor(
    private readonly reclasificarTransaccionUseCase: ReclasificarTransaccionUseCase,
  ) {}

  @Patch(':id/categoria')
  async reclasificar(
    @Param('id') id: string,
    @Body() body: ReclasificarCategoriaBodyDto,
    @CurrentUser() userId: string,
  ) {
    // Manual body validation (mirrors AuthController#login) — no
    // class-validator in this codebase. Non-string/absent → '' so the use
    // case's enum check rejects it uniformly (never undefined/raw object).
    const categoria = typeof body?.categoria === 'string' ? body.categoria : '';

    let result: Awaited<ReturnType<ReclasificarTransaccionUseCase['execute']>>;

    try {
      result = await this.reclasificarTransaccionUseCase.execute({
        userId,
        transaccionId: id,
        categoria,
      });
    } catch (err) {
      // Unexpected adapter/DB error — not a CategoriaInvalidaError/TransaccionNoEncontradaError.
      // Log the real cause server-side (never reflected in the client response)
      // so deploy/DB failures are diagnosable instead of a silent generic 500.
      this.logger.error(
        'Error inesperado al reclasificar la transacción',
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException(
        'Error inesperado al reclasificar la transacción. Intenta nuevamente.',
      );
    }

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof CategoriaInvalidaError) {
        // Scrubbed 400 — raw categoria value NEVER reflected in the HTTP response.
        throw new BadRequestException(
          'La categoría no es válida. Valores esperados: Supermercado, Combustible, Farmacia, Salud, Transporte, Streaming, Delivery, Ahorro.',
        );
      }
      if (error instanceof TransaccionNoEncontradaError) {
        // 404 — merges not-found and not-owned (anti-enumeration).
        throw new NotFoundException(
          'La transacción no existe o no pertenece al usuario autenticado.',
        );
      }
      // Exhaustiveness guard — future error types will fail to compile here
      const _exhaustive: never = error;
      void _exhaustive;
      throw new InternalServerErrorException('Error inesperado');
    }

    return aReclasificarCategoriaDto(result.getValue());
  }
}

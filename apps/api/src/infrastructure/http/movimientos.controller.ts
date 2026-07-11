import {
  Controller,
  Get,
  Query,
  BadRequestException,
  InternalServerErrorException,
  Inject,
} from '@nestjs/common';
import { ObtenerMovimientosMesUseCase } from '../../application/use-cases/obtener-movimientos-mes.use-case';
import { PeriodoInvalidoError } from '../../domain/errors/periodo-invalido.error';
import { aMovimientosMesDto } from './dto/movimiento-mes.dto';
import { USER_ID_FIJO_TOKEN } from '../persistence/constants';

/**
 * MovimientosController — endpoint de consulta de movimientos mensuales.
 *
 * GET /api/movimientos?periodo=YYYY-MM
 *
 * Responsabilidades:
 *   1. Extraer el query param opcional `periodo`.
 *   2. Delegar en ObtenerMovimientosMesUseCase (mismo userId fijo que el pipeline de ingesta).
 *   3. Traducir el Result<T,E> a respuesta HTTP.
 *
 * Cuando `periodo` está ausente → use case usa PeriodoMes.actual() → 200.
 * Cuando `periodo` es inválido → PeriodoInvalidoError → 400.
 * Lista vacía → 200 con envelope vacío (no es un error — REQ-06).
 *
 * NOTE: This endpoint is intentionally unauthenticated for the MVP mono-user phase.
 * Authentication (multi-user, JWT) is a post-MVP concern (ADR-001 / Sprint 3+).
 */
@Controller('api/movimientos')
export class MovimientosController {
  constructor(
    private readonly obtenerMovimientosMesUseCase: ObtenerMovimientosMesUseCase,
    @Inject(USER_ID_FIJO_TOKEN) private readonly userId: string,
  ) {}

  @Get()
  async listar(@Query('periodo') periodo?: string) {
    let result: Awaited<ReturnType<ObtenerMovimientosMesUseCase['execute']>>;

    try {
      result = await this.obtenerMovimientosMesUseCase.execute({
        userId: this.userId,
        periodo,
      });
    } catch (err) {
      // Unexpected adapter/DB error — not a PeriodoInvalidoError
      throw new InternalServerErrorException(
        'Error inesperado al consultar movimientos. Intenta nuevamente.',
      );
    }

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof PeriodoInvalidoError) {
        // Use a static scrubbed message so raw user input is never reflected in the HTTP 400 body.
        // The full error (with the raw value) is available server-side in error.message if needed for logging.
        throw new BadRequestException(
          'El período no es válido. Formato esperado: YYYY-MM (ej: 2026-07).',
        );
      }
      // Exhaustiveness guard — future error types will fail to compile here
      const _exhaustive: never = error;
      void _exhaustive;
      throw new InternalServerErrorException('Error inesperado');
    }

    return aMovimientosMesDto(result.getValue());
  }
}

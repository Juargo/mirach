import {
  Controller,
  Get,
  Query,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ObtenerMovimientosMesUseCase } from '../../application/use-cases/obtener-movimientos-mes.use-case';
import { PeriodoInvalidoError } from '../../domain/errors/periodo-invalido.error';
import { aMovimientosMesDto } from './dto/movimiento-mes.dto';
import { CurrentUser } from './auth/current-user.decorator';

/**
 * MovimientosController — endpoint de consulta de movimientos mensuales.
 *
 * GET /api/movimientos?periodo=YYYY-MM
 *
 * Responsabilidades:
 *   1. Extraer el query param opcional `periodo`.
 *   2. Delegar en ObtenerMovimientosMesUseCase con el userId autenticado.
 *   3. Traducir el Result<T,E> a respuesta HTTP.
 *
 * Cuando `periodo` está ausente → use case usa PeriodoMes.actual() → 200.
 * Cuando `periodo` es inválido → PeriodoInvalidoError → 400.
 * Lista vacía → 200 con envelope vacío (no es un error — REQ-06).
 *
 * NOTE: Protected by the global ApiKeyGuard (shared API key, fail-closed) AND
 * SessionGuard (per-user session, ISO-01/02) — userId viene de la sesión
 * autenticada vía @CurrentUser(), nunca de una constante fija.
 */
@Controller('api/movimientos')
export class MovimientosController {
  private readonly logger = new Logger(MovimientosController.name);

  constructor(
    private readonly obtenerMovimientosMesUseCase: ObtenerMovimientosMesUseCase,
  ) {}

  @Get()
  async listar(
    @Query('periodo') periodo: string | undefined,
    @CurrentUser() userId: string,
  ) {
    let result: Awaited<ReturnType<ObtenerMovimientosMesUseCase['execute']>>;

    try {
      result = await this.obtenerMovimientosMesUseCase.execute({
        userId,
        periodo,
      });
    } catch (err) {
      // Unexpected adapter/DB error — not a PeriodoInvalidoError. Log the real
      // cause server-side (never reflected in the client response) so deploy/DB
      // failures are diagnosable instead of a silent generic 500.
      this.logger.error(
        'Error inesperado al consultar movimientos',
        err instanceof Error ? err.stack : String(err),
      );
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

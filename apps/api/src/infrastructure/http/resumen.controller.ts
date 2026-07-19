import {
  Controller,
  Get,
  Query,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { CalcularResumenMesUseCase } from '../../application/use-cases/calcular-resumen-mes.use-case';
import { CalcularResumenAnualUseCase } from '../../application/use-cases/calcular-resumen-anual.use-case';
import { PeriodoInvalidoError } from '../../domain/errors/periodo-invalido.error';
import { AnioInvalidoError } from '../../domain/errors/anio-invalido.error';
import { ResumenAnualInvalidoError } from '../../domain/errors/resumen-anual-invalido.error';
import { aResumenMesDto } from './dto/resumen-mes.dto';
import { aResumenAnualDto } from './dto/resumen-anual.dto';
import { CurrentUser } from './auth/current-user.decorator';

/**
 * ResumenController — endpoint for the 50/30/20 monthly breakdown.
 *
 * GET /api/resumen?periodo=YYYY-MM
 *
 * Mirrors MovimientosController exactly:
 *   1. Extract optional `periodo` query param.
 *   2. Delegate to CalcularResumenMesUseCase with the authenticated userId.
 *   3. Translate Result<T,E> to HTTP response.
 *
 * periodo absent  → use case resolves to PeriodoMes.actual() → 200.
 * periodo invalid → PeriodoInvalidoError → scrubbed 400 (raw input NEVER reflected).
 * sinIngreso=true → still 200 (valid data state, not an error — SC-04).
 *
 * NOTE: Protected by the global ApiKeyGuard (shared API key, fail-closed) AND
 * SessionGuard (per-user session, ISO-01/02) — userId comes from the
 * authenticated session via @CurrentUser(), never from a fixed constant.
 */
@Controller('api/resumen')
export class ResumenController {
  private readonly logger = new Logger(ResumenController.name);

  constructor(
    private readonly calcularResumenMesUseCase: CalcularResumenMesUseCase,
    private readonly calcularResumenAnualUseCase: CalcularResumenAnualUseCase,
  ) {}

  @Get()
  async obtener(
    @Query('periodo') periodo: string | undefined,
    @CurrentUser() userId: string,
  ) {
    let result: Awaited<ReturnType<CalcularResumenMesUseCase['execute']>>;

    try {
      result = await this.calcularResumenMesUseCase.execute({
        userId,
        periodo,
      });
    } catch (err) {
      // Unexpected adapter/DB error — not a PeriodoInvalidoError. Log the real
      // cause server-side (never reflected in the client response) so deploy/DB
      // failures are diagnosable instead of a silent generic 500.
      this.logger.error(
        'Error inesperado al calcular el resumen',
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException(
        'Error inesperado al calcular el resumen. Intenta nuevamente.',
      );
    }

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof PeriodoInvalidoError) {
        // Scrubbed 400 — raw periodo value NEVER reflected in the HTTP response.
        throw new BadRequestException(
          'El período no es válido. Formato esperado: YYYY-MM (ej: 2026-07).',
        );
      }
      // Exhaustiveness guard — future error types will fail to compile here
      const _exhaustive: never = error;
      void _exhaustive;
      throw new InternalServerErrorException('Error inesperado');
    }

    const { periodo: periodoStr, resumen } = result.getValue();
    return aResumenMesDto(periodoStr, resumen);
  }

  /**
   * GET /api/resumen/anual?anio=YYYY — 50/30/20 annual breakdown (US-030 Slice A).
   *
   * anio absent  → use case resolves to PeriodoAnio.actual() → 200.
   * anio invalid → AnioInvalidoError → scrubbed 400 (raw input NEVER reflected).
   *
   * Mirrors obtener() exactly — same Result-to-HTTP translation, same
   * @CurrentUser() isolation.
   */
  @Get('anual')
  async obtenerAnual(
    @Query('anio') anio: string | undefined,
    @CurrentUser() userId: string,
  ) {
    let result: Awaited<ReturnType<CalcularResumenAnualUseCase['execute']>>;

    try {
      result = await this.calcularResumenAnualUseCase.execute({
        userId,
        anio,
      });
    } catch (err) {
      this.logger.error(
        'Error inesperado al calcular el resumen anual',
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException(
        'Error inesperado al calcular el resumen anual. Intenta nuevamente.',
      );
    }

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof AnioInvalidoError) {
        // Scrubbed 400 — raw anio value NEVER reflected in the HTTP response.
        throw new BadRequestException(
          'El año no es válido. Debe ser un entero entre 2000 y 2100.',
        );
      }
      if (error instanceof ResumenAnualInvalidoError) {
        // Invariant violation, not a user input problem (should never happen
        // in practice — PeriodoAnio.meses() always yields exactly 12 entries).
        // Fail-closed as a 500; log server-side for diagnosis, never reflect
        // internal details in the HTTP response.
        this.logger.error(
          'Invariante de ResumenAnual violada al ensamblar el resumen anual',
          error.stack,
        );
        throw new InternalServerErrorException(
          'Error inesperado al calcular el resumen anual. Intenta nuevamente.',
        );
      }
      // Exhaustiveness guard — future error types will fail to compile here
      const _exhaustive: never = error;
      void _exhaustive;
      throw new InternalServerErrorException('Error inesperado');
    }

    const { resumenAnual } = result.getValue();
    return aResumenAnualDto(resumenAnual);
  }
}

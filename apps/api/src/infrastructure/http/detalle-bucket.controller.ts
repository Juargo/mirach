import {
  Controller,
  Get,
  Param,
  Query,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ObtenerDetalleBucketUseCase } from '../../application/use-cases/obtener-detalle-bucket.use-case';
import { BucketInvalidoError } from '../../domain/errors/bucket-invalido.error';
import { PeriodoInvalidoError } from '../../domain/errors/periodo-invalido.error';
import { Bucket } from '../../domain/value-objects/bucket';
import { aDetalleBucketDto } from './dto/detalle-bucket.dto';
import { CurrentUser } from './auth/current-user.decorator';

/**
 * DetalleBucketController — endpoint for the bucket-detail drill-down (US-017).
 *
 * GET /api/buckets/:bucket?periodo=YYYY-MM
 *
 * Mirrors ResumenController exactly:
 *   1. Extract path param `:bucket` (raw string) + optional `periodo` query param.
 *   2. Delegate to ObtenerDetalleBucketUseCase with the authenticated userId.
 *   3. Translate Result<T,E> to HTTP response.
 *
 * :bucket invalid   → BucketInvalidoError  → scrubbed 400 (raw input NEVER reflected).
 * periodo invalid   → PeriodoInvalidoError → scrubbed 400 (raw input NEVER reflected).
 * periodo absent    → use case resolves to PeriodoMes.actual() → 200.
 * empty transaction list → still 200 (valid data state, not an error).
 *
 * NOTE: Protected by the global ApiKeyGuard (shared API key, fail-closed) AND
 * SessionGuard (per-user session, ISO-01/02) — userId comes from the
 * authenticated session via @CurrentUser(), never from a fixed constant.
 */
@Controller('api/buckets')
export class DetalleBucketController {
  private readonly logger = new Logger(DetalleBucketController.name);

  constructor(
    private readonly obtenerDetalleBucketUseCase: ObtenerDetalleBucketUseCase,
  ) {}

  @Get(':bucket')
  async obtener(
    @Param('bucket') bucket: Bucket,
    @Query('periodo') periodo: string | undefined,
    @CurrentUser() userId: string,
  ) {
    let result: Awaited<ReturnType<ObtenerDetalleBucketUseCase['execute']>>;

    try {
      result = await this.obtenerDetalleBucketUseCase.execute({
        userId,
        bucket,
        periodo,
      });
    } catch (err) {
      // Unexpected adapter/DB error — not a BucketInvalidoError/PeriodoInvalidoError.
      // Log the real cause server-side (never reflected in the client response)
      // so deploy/DB failures are diagnosable instead of a silent generic 500.
      this.logger.error(
        'Error inesperado al obtener el detalle del bucket',
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException(
        'Error inesperado al obtener el detalle del bucket. Intenta nuevamente.',
      );
    }

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof BucketInvalidoError) {
        // Scrubbed 400 — raw :bucket value NEVER reflected in the HTTP response.
        throw new BadRequestException(
          'El bucket no es válido. Valores esperados: Necesidades, Deseos, Ahorro, Ingreso, SinCategoria.',
        );
      }
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

    return aDetalleBucketDto(result.getValue());
  }
}
